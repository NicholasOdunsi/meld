import { existsSync, readFileSync } from "node:fs";
import {
  findSqlFunctionArityErrors,
  inspectSqlFunctionArities,
} from "./check-sql-function-arities.mjs";

// Which SQL functions must be called with how many arguments, and in which
// files. This table used to live inline in package.json as a three-command
// `&&` chain, where the arities looked like a contradiction and nothing
// explained them.
//
// create_invitation appears at two arities on purpose:
//
//   202607240003_invitations.sql defines and grants the original five-argument
//   signature. 202607250003_product_roles.sql later drops it and recreates it
//   with a sixth argument, invitee_product_role. Pinning the old migration at
//   five keeps applied history frozen; pinning the test at six keeps it
//   honest about the signature that exists today.
//
//   202607250003_product_roles.sql itself is deliberately not listed: it
//   contains both the five-argument `drop function` and the six-argument
//   `create function`, so no single expected arity describes it.
//
// record_device_connection follows the same create_invitation precedent:
// 202607280002_device_pairing.sql contains both a `drop function` and a
// `create function` for it at the same two-argument arity (only the body
// changed, not the signature), so it is deliberately not added to that
// file's list below -- doing so would pin one expected arity to a file that
// contains two distinct intents (drop the old, create the new).
//
// 202607290001_provider_setup.sql replaces redeem_device_pairing_code and
// revoke_execution_device the same way, each at its existing arity, so it is
// left off those two entries' file lists for the same reason.
export const SQL_FUNCTION_ARITIES = [
  {
    functionName: "public.ai_task_lease_duration",
    arity: 0,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.transition_ai_task",
    arity: 3,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.create_ai_task",
    arity: 6,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      // 202607290002 replaces create_ai_task at the same 6-argument signature
      // to refuse room_reply, and room_agent_messages exercises both the
      // refusal and an accepted later-kind creation.
      "supabase/migrations/202607290002_room_agent_messages.sql",
      "supabase/tests/ai_task_transitions.test.sql",
      "supabase/tests/room_agent_messages.test.sql",
    ],
  },
  {
    functionName: "public.cancel_ai_task",
    arity: 1,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.resolve_ai_task",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.claim_ai_task",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.append_ai_task_event",
    arity: 6,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.renew_ai_task_leases",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.settle_ai_task",
    arity: 8,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      // 202607290002 replaces settle_ai_task at the same 8-argument signature
      // to add the room_reply message insertion, and room_agent_messages
      // settles tasks through it.
      "supabase/migrations/202607290002_room_agent_messages.sql",
      "supabase/tests/ai_task_transitions.test.sql",
      "supabase/tests/room_agent_messages.test.sql",
    ],
  },
  {
    functionName: "public.acknowledge_task_cancellation",
    arity: 3,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.reap_expired_ai_task_leases",
    arity: 0,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.get_ai_task_lease_seconds",
    arity: 0,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.get_execution_device_for_auth",
    arity: 1,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.record_device_connection",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.upsert_provider_connections",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      // settle_provider_setup_request calls it rather than writing
      // provider_connections itself, so the call site belongs here too.
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.list_dispatchable_ai_tasks",
    arity: 1,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.hydrate_authorized_room_context",
    arity: 2,
    files: [
      "supabase/migrations/202607280001_ai_tasks.sql",
      "supabase/tests/ai_task_transitions.test.sql",
    ],
  },
  {
    functionName: "public.authorize_invitation_delivery",
    arity: 3,
    files: [
      "supabase/migrations/202607240003_invitations.sql",
      "supabase/tests/invitations.test.sql",
    ],
  },
  {
    functionName: "public.create_invitation",
    arity: 5,
    files: ["supabase/migrations/202607240003_invitations.sql"],
  },
  {
    functionName: "public.create_invitation",
    arity: 6,
    files: ["supabase/tests/invitations.test.sql"],
  },
  {
    functionName: "public.create_device_pairing_code",
    arity: 2,
    files: [
      "supabase/migrations/202607280002_device_pairing.sql",
      "supabase/tests/device_pairing.test.sql",
    ],
  },
  {
    functionName: "public.redeem_device_pairing_code",
    arity: 5,
    files: [
      "supabase/migrations/202607280002_device_pairing.sql",
      "supabase/tests/device_pairing.test.sql",
    ],
  },
  {
    functionName: "public.revoke_execution_device",
    arity: 1,
    files: [
      "supabase/migrations/202607280002_device_pairing.sql",
      "supabase/tests/device_pairing.test.sql",
    ],
  },
  {
    functionName: "public.list_execution_devices",
    arity: 0,
    files: [
      "supabase/migrations/202607280002_device_pairing.sql",
      "supabase/tests/device_pairing.test.sql",
    ],
  },
  {
    functionName: "public.create_provider_setup_request",
    arity: 2,
    files: [
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/provider_setup.test.sql",
    ],
  },
  {
    functionName: "public.list_dispatchable_provider_setups",
    arity: 1,
    files: [
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/provider_setup.test.sql",
    ],
  },
  {
    functionName: "public.record_provider_setup_progress",
    arity: 4,
    files: [
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/provider_setup.test.sql",
    ],
  },
  {
    functionName: "public.settle_provider_setup_request",
    arity: 6,
    files: [
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/provider_setup.test.sql",
    ],
  },
  {
    functionName: "public.set_ai_user_preference",
    arity: 2,
    files: [
      "supabase/migrations/202607290001_provider_setup.sql",
      "supabase/tests/provider_setup.test.sql",
    ],
  },
  {
    functionName: "public.create_room_reply_task",
    arity: 2,
    // The migration declares and grants the two-argument signature.
    // room_agent_messages.test.sql is deliberately not listed: it calls the
    // function through its one-argument default-provider form, which is a
    // legitimate call at a different arity than this entry pins.
    files: [
      "supabase/migrations/202607290002_room_agent_messages.sql",
    ],
  },
  {
    functionName: "public.list_room_ai_task_statuses",
    arity: 1,
    files: [
      "supabase/migrations/202607290002_room_agent_messages.sql",
      "supabase/tests/room_agent_messages.test.sql",
    ],
  },
  {
    functionName: "public.ai_message_text_array_ok",
    arity: 3,
    files: [
      "supabase/migrations/202607290002_room_agent_messages.sql",
    ],
  },
  {
    functionName: "public.post_discovery_message",
    arity: 5,
    files: [
      "supabase/migrations/202608020001_atomic_discovery_messages.sql",
    ],
  },
  {
    functionName: "public.post_room_message",
    arity: 5,
    files: [
      "supabase/tests/room_access.test.sql",
    ],
  },
];

export function missingExpectationFiles(expectations) {
  return expectations
    .flatMap(({ files }) => files)
    .filter((path) => !existsSync(path));
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  // A renamed or mistyped path would otherwise make an expectation vacuous
  // instead of failing, so it is caught before any arity is inspected.
  const missing = missingExpectationFiles(SQL_FUNCTION_ARITIES);
  if (missing.length > 0) {
    for (const path of missing) {
      console.error(`${path}: expectation refers to a file that is missing`);
    }
    process.exitCode = 1;
  } else {
    let failed = false;

    for (const { functionName, arity, files } of SQL_FUNCTION_ARITIES) {
      const sources = files.map((path) => ({
        sourceName: path,
        source: readFileSync(path, "utf8"),
      }));
      const errors = findSqlFunctionArityErrors(
        sources,
        functionName,
        arity,
      );

      if (errors.length > 0) {
        failed = true;
        for (const error of errors) {
          console.error(
            `${error.sourceName}:${error.line}: ${functionName} has ${error.arity} arguments; expected ${arity}`,
          );
        }
        continue;
      }

      const occurrenceCount = sources.flatMap(
        ({ source, sourceName }) =>
          inspectSqlFunctionArities(
            source,
            functionName,
            arity,
            sourceName,
          ),
      ).length;
      console.log(
        `${functionName}: ${occurrenceCount} occurrences use ${arity} arguments`,
      );
    }

    if (failed) {
      process.exitCode = 1;
    }
  }
}
