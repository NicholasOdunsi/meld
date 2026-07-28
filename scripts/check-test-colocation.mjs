import { readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

// Every `*.test.ts(x)` must sit in the same directory as the module it
// covers, named after it. 32 of the 38 test files already did this when the
// rule was written; the rest had drifted a directory away from their source,
// which is how two of them ended up testing something other than their name.

const TEST_PATTERN = /\.test\.(ts|tsx)$/;
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
]);

// A large suite may be split by facet -- composer.attachments.test.tsx,
// composer.mentions.test.tsx -- as long as the leading segment still names a
// module sitting beside it. The exact stem is tried first, so
// next.config.test.ts still matches next.config.ts rather than next.ts.
export function testSourceCandidates(testPath) {
  const directory = posix.dirname(testPath);
  const stem = posix.basename(testPath).replace(TEST_PATTERN, "");
  const stems = [stem];
  const facetSeparator = stem.lastIndexOf(".");
  if (facetSeparator > 0) {
    stems.push(stem.slice(0, facetSeparator));
  }
  return stems.flatMap((candidateStem) =>
    SOURCE_EXTENSIONS.map((extension) =>
      posix.join(directory, `${candidateStem}${extension}`),
    ),
  );
}

/**
 * @param {string[]} filePaths every file in the scanned tree, posix-style
 * @returns {{ testPath: string, expected: string[] }[]}
 */
export function findMisplacedTests(filePaths) {
  const present = new Set(filePaths);
  return filePaths
    .filter((path) => TEST_PATTERN.test(path))
    .sort()
    .map((testPath) => ({
      testPath,
      expected: testSourceCandidates(testPath),
    }))
    .filter(({ expected }) =>
      expected.every((candidate) => !present.has(candidate)),
    );
}

export function listFiles(root) {
  const found = [];
  const toPosix = (path) => path.split(/[\\/]/).join(posix.sep);
  if (!statSync(root).isDirectory()) {
    return [toPosix(root)];
  }
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue;
      }
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
      } else {
        found.push(toPosix(absolute));
      }
    }
  };
  walk(root);
  return found;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const roots = process.argv.slice(2);

  if (roots.length === 0) {
    console.error(
      "Usage: node scripts/check-test-colocation.mjs <directory...>",
    );
    process.exitCode = 1;
  } else {
    const filePaths = roots.flatMap((root) => listFiles(root));
    const misplaced = findMisplacedTests(filePaths);

    if (misplaced.length > 0) {
      for (const { testPath, expected } of misplaced) {
        console.error(
          `${testPath}: no module beside it to test; expected one of ${expected.join(
            ", ",
          )}`,
        );
      }
      console.error(
        "Move the test next to the module it covers, or rename it after the module it actually tests.",
      );
      process.exitCode = 1;
    } else {
      const testCount = filePaths.filter((path) =>
        TEST_PATTERN.test(path),
      ).length;
      console.log(
        `test colocation: ${testCount} test files sit beside their module`,
      );
    }
  }
}
