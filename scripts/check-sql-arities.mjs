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
export const SQL_FUNCTION_ARITIES = [
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
