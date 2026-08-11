// Repairs attachment text damaged by the Node 20 windows-1252 decoding bug.
//
// Extraction runs once at upload and the result is persisted to
// public.attachments.extracted_text, so fixing the extractor (9a76d30) only
// protects new uploads. Rows written while the app ran on Node 20 still hold
// text with every smart quote, dash, ellipsis and bullet deleted -- and that
// stored text is what the Product Agent reads as room context.
//
// The original bytes are retained in the discovery-attachments bucket, so the
// repair is a re-extraction rather than a re-upload. Nothing is lost either
// way: this script never deletes, and only ever writes text that is longer
// than what it replaces (see planRow).
//
// Usage (dry run -- reports what would change, writes nothing):
//   pnpm exec tsx scripts/backfill-attachment-text.ts
//
// Apply:
//   pnpm exec tsx scripts/backfill-attachment-text.ts --apply
//
// Options:
//   --apply          write the repairs (default is a dry run)
//   --room <uuid>    limit to one room
//   --limit <n>      stop after n candidate rows
//   --samples <n>    how many before/after samples to print (default 5)
//
// Environment:
//   SUPABASE_DB_URL             direct database connection, as seed-device.ts uses
//   NEXT_PUBLIC_SUPABASE_URL    storage API, for downloading the original bytes
//   SUPABASE_SERVICE_ROLE_KEY   storage API credential
//
// Rows are read and written over a direct database connection rather than
// PostgREST because this schema deliberately grants table access to
// `authenticated` only -- service_role has no blanket rights on
// public.attachments, and handing it some for a one-off repair would weaken a
// boundary the schema sets on purpose.
//
// Storage objects come over plain fetch rather than @supabase/supabase-js:
// that package is a dependency of apps/web, not of the root, so importing it
// from scripts/ resolves only by accident of the workspace layout. One HTTP
// GET keeps this script runnable on its own terms.

import postgres from "postgres";
import {
  DECODED_TEXT_MIME_TYPES,
  extractAttachmentText,
} from "../apps/web/src/features/rooms/attachment-extractor";
import { planRow, summarize } from "./attachment-backfill-plan.mjs";

const ATTACHMENT_BUCKET = "discovery-attachments";

type AttachmentRow = {
  id: string;
  room_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  extraction_status: string;
  extracted_text: string | null;
};

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value`);
  }
  return value;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// Show the damage in context rather than as whole documents: find where the
// texts first diverge and print a window around it, with the restored
// characters marked. A reviewer can then judge the change from the report
// instead of having to query the database themselves.
function sample(storedText: string, nextText: string): string {
  let at = 0;
  while (
    at < storedText.length &&
    at < nextText.length &&
    storedText[at] === nextText[at]
  ) {
    at += 1;
  }
  const from = Math.max(0, at - 40);
  const clip = (value: string) =>
    JSON.stringify(value.slice(from, at + 40)).slice(1, -1);
  return `      before: …${clip(storedText)}…\n      after:  …${clip(nextText)}…`;
}

async function main(): Promise<void> {
  const apply = flag("apply");
  const room = option("room");
  const limit = Number(option("limit") ?? "0");
  const maxSamples = Number(option("samples") ?? "5");

  const storageUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const sql = postgres(required("SUPABASE_DB_URL"), { max: 1 });

  const rows = (await sql<AttachmentRow[]>`
    select id, room_id, original_name, storage_path, mime_type,
           extraction_status, extracted_text
    from public.attachments
    where extraction_status = 'ready'
      and mime_type in ${sql([...DECODED_TEXT_MIME_TYPES])}
      ${room ? sql`and room_id = ${room}` : sql``}
    order by created_at asc
    ${limit > 0 ? sql`limit ${limit}` : sql``}
  `) as unknown as AttachmentRow[];
  console.log(
    `${apply ? "APPLY" : "DRY RUN"} — ${rows.length} candidate row(s)` +
      `${room ? ` in room ${room}` : ""}\n`,
  );

  const decisions = [];
  const skips: string[] = [];
  let printed = 0;
  let written = 0;

  for (const row of rows) {
    const response = await fetch(
      `${storageUrl}/storage/v1/object/${ATTACHMENT_BUCKET}/${row.storage_path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { headers: { Authorization: `Bearer ${serviceKey}` } },
    );
    if (!response.ok) {
      // A missing object is not something this script should paper over: the
      // row stays exactly as it is and the path is reported.
      skips.push(
        `${row.id} (${row.original_name}): storage unreadable — ` +
          `HTTP ${response.status}`,
      );
      decisions.push({ kind: "skip" as const });
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const nextText = await extractAttachmentText({
      mimeType: row.mime_type,
      bytes,
    });

    const decision = planRow(row, nextText, DECODED_TEXT_MIME_TYPES);
    decisions.push(decision);

    if (decision.kind === "skip") {
      skips.push(`${row.id} (${row.original_name}): ${decision.reason}`);
      continue;
    }
    if (decision.kind === "unchanged") continue;

    if (printed < maxSamples) {
      printed += 1;
      const restored = decision.restored.length
        ? decision.restored.join(" ")
        : "(no C1 characters — differs for another reason)";
      console.log(`  ${row.original_name}  [${row.id}]`);
      console.log(`      restores: ${restored}`);
      console.log(sample(row.extracted_text ?? "", decision.nextText));
      console.log("");
    }

    if (apply) {
      // Extraction status is deliberately untouched: these rows were ready
      // before and stay ready, so the table's status/text check constraint
      // holds throughout. The extracted_text guard makes the write idempotent
      // -- a re-run after a partial failure updates only what is still stale,
      // and never overwrites a row someone has since corrected by hand.
      const updated = await sql`
        update public.attachments
        set extracted_text = ${decision.nextText}
        where id = ${row.id}
          and extraction_status = 'ready'
          and extracted_text is not distinct from ${row.extracted_text}
        returning id
      `;
      if (updated.length === 1) written += 1;
      else {
        skips.push(
          `${row.id} (${row.original_name}): row changed under us; not written`,
        );
      }
    }
  }

  const summary = summarize(decisions);
  if (printed < summary.restore) {
    console.log(
      `  … and ${summary.restore - printed} more not shown ` +
        `(raise --samples to see them)\n`,
    );
  }
  if (skips.length > 0) {
    console.log("Skipped (left untouched):");
    for (const line of skips) console.log(`  - ${line}`);
    console.log("");
  }

  console.log(
    `scanned ${summary.scanned} · unchanged ${summary.unchanged} · ` +
      `to restore ${summary.restore} · skipped ${summary.skip}`,
  );
  if (apply) {
    console.log(`written: ${written}`);
  } else if (summary.restore > 0) {
    console.log("\nNothing was written. Re-run with --apply to repair.");
  }

  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
