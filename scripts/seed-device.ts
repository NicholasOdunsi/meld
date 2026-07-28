import { randomUUID } from "node:crypto";
import { ProviderSchema } from "@meld/contracts";
import postgres from "postgres";
import { mintDeviceCredential } from "../apps/gateway/src/auth/device-token";

function option(name: string): string | undefined {
  const argument = `--${name}`;
  const index = process.argv.indexOf(argument);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL is required");
  }

  const requestedUserId = option("user");
  const name = option("name") ?? "Local development connector";
  const provider = ProviderSchema.parse(option("provider") ?? "codex");
  const deviceId = randomUUID();
  const minted = mintDeviceCredential(deviceId);
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.begin(async (transaction) => {
      let userId = requestedUserId;
      if (!userId) {
        const users = await transaction<{ id: string }[]>`
          select id
          from auth.users
          order by created_at, id
          limit 1
        `;
        userId = users[0]?.id;
      }

      if (!userId) {
        throw new Error(
          "No auth user exists; pass --user <uuid> after creating one",
        );
      }

      await transaction`
        insert into public.execution_devices (
          id,
          user_id,
          name,
          platform,
          token_hash,
          status
        )
        values (
          ${deviceId},
          ${userId},
          ${name},
          ${process.platform},
          ${minted.tokenHash},
          'active'
        )
      `;

      await transaction`
        insert into public.provider_connections (
          user_id,
          device_id,
          provider,
          installation,
          version,
          authentication,
          compatibility,
          last_seen_at
        )
        values (
          ${userId},
          ${deviceId},
          ${provider},
          'installed',
          'fake-connector/1.0.0',
          'authenticated',
          'supported',
          now()
        )
      `;
    });

    process.stdout.write(`${minted.credential}\n`);
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Failed to seed execution device", error);
  process.exitCode = 1;
});
