import { readFileSync } from "node:fs";

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCallArity(source, openParenthesisIndex) {
  let depth = 0;
  let commas = 0;
  let hasArgument = false;
  let quote = null;

  for (let index = openParenthesisIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (quote) {
      if (character === quote) {
        if (nextCharacter === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      if (depth === 1) {
        hasArgument = true;
      }
      continue;
    }

    if (character === "-" && nextCharacter === "-") {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 1;
      continue;
    }

    if (character === "(") {
      depth += 1;
      if (depth > 1) {
        hasArgument = true;
      }
      continue;
    }

    if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          arity: hasArgument ? commas + 1 : 0,
          endIndex: index,
        };
      }
      continue;
    }

    if (depth === 1 && character === ",") {
      commas += 1;
      continue;
    }

    if (depth === 1 && !/\s/.test(character)) {
      hasArgument = true;
    }
  }

  throw new Error("Unclosed SQL function argument list.");
}

export function inspectSqlFunctionArities(
  source,
  functionName,
  expectedArity,
  sourceName = "SQL source",
) {
  const pattern = new RegExp(
    `${escapeRegularExpression(functionName)}\\s*\\(`,
    "g",
  );
  const calls = [];

  for (const match of source.matchAll(pattern)) {
    const openParenthesisIndex =
      match.index + match[0].lastIndexOf("(");
    const { arity } = readCallArity(source, openParenthesisIndex);
    const line =
      source.slice(0, match.index).split("\n").length;
    calls.push({
      sourceName,
      line,
      arity,
      expectedArity,
    });
  }

  return calls;
}

export function findSqlFunctionArityErrors(
  sources,
  functionName,
  expectedArity,
) {
  return sources
    .flatMap(({ source, sourceName }) =>
      inspectSqlFunctionArities(
        source,
        functionName,
        expectedArity,
        sourceName,
      ),
    )
    .filter(({ arity }) => arity !== expectedArity);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const [functionName, expectedArityInput, ...paths] =
    process.argv.slice(2);
  const expectedArity = Number(expectedArityInput);

  if (
    !functionName ||
    !Number.isInteger(expectedArity) ||
    expectedArity < 0 ||
    paths.length === 0
  ) {
    console.error(
      "Usage: node scripts/check-sql-function-arities.mjs <function> <arity> <sql-file...>",
    );
    process.exitCode = 1;
  } else {
    const sources = paths.map((path) => ({
      sourceName: path,
      source: readFileSync(path, "utf8"),
    }));
    const errors = findSqlFunctionArityErrors(
      sources,
      functionName,
      expectedArity,
    );

    if (errors.length > 0) {
      for (const error of errors) {
        console.error(
          `${error.sourceName}:${error.line}: ${functionName} has ${error.arity} arguments; expected ${expectedArity}`,
        );
      }
      process.exitCode = 1;
    } else {
      const occurrenceCount = sources
        .flatMap(({ source, sourceName }) =>
          inspectSqlFunctionArities(
            source,
            functionName,
            expectedArity,
            sourceName,
          ),
        )
        .length;
      console.log(
        `${functionName}: ${occurrenceCount} occurrences use ${expectedArity} arguments`,
      );
    }
  }
}
