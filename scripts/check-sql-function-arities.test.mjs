import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  findSqlFunctionArityErrors,
  inspectSqlFunctionArities,
} from "./check-sql-function-arities.mjs";

const FUNCTION_NAME = "public.authorize_invitation_delivery";

test("counts nested SQL expressions as single arguments", () => {
  const source = `
    select ${FUNCTION_NAME}(
      (select id from public.organizations limit 1),
      '50000000-0000-4000-8000-000000000005',
      encode(extensions.digest(convert_to('A,B', 'UTF8'), 'sha256'), 'hex')
    );
  `;

  assert.deepEqual(
    inspectSqlFunctionArities(source, FUNCTION_NAME, 3).map(
      ({ arity }) => arity,
    ),
    [3],
  );
});

test("reports a mismatched SQL function-call arity", () => {
  const source = `
    select ${FUNCTION_NAME}(
      '30000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000005',
      repeat('f', 64),
      'unexpected'
    );
  `;

  assert.deepEqual(
    findSqlFunctionArityErrors(
      [{ source, sourceName: "fixture.sql" }],
      FUNCTION_NAME,
      3,
    ),
    [
      {
        sourceName: "fixture.sql",
        line: 2,
        arity: 4,
        expectedArity: 3,
      },
    ],
  );
});

test("repository function definitions and calls use declared arities", () => {
  const paths = [
    "supabase/migrations/202607240003_invitations.sql",
    "supabase/tests/invitations.test.sql",
  ];
  const sources = paths.map((path) => ({
    sourceName: path,
    source: readFileSync(path, "utf8"),
  }));
  const signatures = [
    {
      functionName: "public.authorize_invitation_delivery",
      expectedArity: 3,
      expectedOccurrences: 6,
    },
    {
      functionName: "public.create_invitation",
      expectedArity: 5,
      expectedOccurrences: 9,
    },
  ];

  for (const signature of signatures) {
    const occurrences = sources.flatMap(({ source, sourceName }) =>
      inspectSqlFunctionArities(
        source,
        signature.functionName,
        signature.expectedArity,
        sourceName,
      ),
    );

    assert.equal(
      occurrences.length,
      signature.expectedOccurrences,
      signature.functionName,
    );
    assert.deepEqual(
      findSqlFunctionArityErrors(
        sources,
        signature.functionName,
        signature.expectedArity,
      ),
      [],
    );
  }
});
