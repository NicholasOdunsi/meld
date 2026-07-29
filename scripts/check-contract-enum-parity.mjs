import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "pgsql-parser";
import { tsImport } from "tsx/esm/api";

export const AI_TASK_MIGRATION =
  "supabase/migrations/202607280001_ai_tasks.sql";
export const PROVIDER_SETUP_MIGRATION =
  "supabase/migrations/202607290001_provider_setup.sql";

// Every migration that declares an enum the TypeScript contracts also
// declare. A new one must be added here, otherwise its enum is simply absent
// from the SQL side and the "SQL enum is missing" error below is the only
// hint -- which reads as a missing type rather than a missing file.
export const ENUM_MIGRATIONS = [AI_TASK_MIGRATION, PROVIDER_SETUP_MIGRATION];

function enumName(typeName) {
  return typeName.map(({ String: value }) => value.sval).join(".");
}

/**
 * @param {string} source
 * @returns {Promise<Record<string, string[]>>}
 */
export async function parseSqlEnums(source) {
  const tree = await parse(source);
  return Object.fromEntries(
    tree.stmts.flatMap(({ stmt }) => {
      const createEnum = stmt.CreateEnumStmt;
      if (!createEnum) {
        return [];
      }
      const qualifiedName = enumName(createEnum.typeName);
      const name = qualifiedName.replace(/^public\./, "");
      return [
        [
          name,
          createEnum.vals.map(({ String: value }) => value.sval),
        ],
      ];
    }),
  );
}

/**
 * @param {Record<string, string[]>} sqlEnums
 * @param {Record<string, readonly string[]>} contractEnums
 * @returns {string[]}
 */
export function compareContractEnums(sqlEnums, contractEnums) {
  const errors = [];

  for (const [name, contractValues] of Object.entries(contractEnums)) {
    const sqlValues = sqlEnums[name];
    if (!sqlValues) {
      errors.push(`${name}: SQL enum is missing`);
      continue;
    }

    const sqlSet = new Set(sqlValues);
    const contractSet = new Set(contractValues);
    for (const value of contractValues) {
      if (!sqlSet.has(value)) {
        errors.push(
          `${name}: SQL is missing contract value ${JSON.stringify(value)}`,
        );
      }
    }
    for (const value of sqlValues) {
      if (!contractSet.has(value)) {
        errors.push(`${name}: SQL has extra value ${JSON.stringify(value)}`);
      }
    }
  }

  return errors;
}

/**
 * Merges the enums declared across several migrations into one map. A name
 * declared twice is an error rather than a last-one-wins merge: two
 * `create type` statements for the same enum cannot both have applied, so
 * silently keeping one would compare the contracts against a type that does
 * not exist in the database.
 *
 * @param {string[]} paths
 * @returns {Promise<Record<string, string[]>>}
 */
export async function parseSqlEnumsFromFiles(paths) {
  const merged = {};

  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`${path}: migration file is missing`);
    }
    const enums = await parseSqlEnums(readFileSync(path, "utf8"));
    for (const [name, values] of Object.entries(enums)) {
      if (merged[name]) {
        throw new Error(
          `${name}: SQL enum is declared in more than one migration`,
        );
      }
      merged[name] = values;
    }
  }

  return merged;
}

export async function loadContractEnums() {
  const contracts = await tsImport("@meld/contracts", import.meta.url);
  return {
    ai_provider: contracts.ProviderSchema.options,
    ai_task_kind: contracts.AITaskKindSchema.options,
    ai_task_status: contracts.AITaskStatusSchema.options,
    provider_installation_status:
      contracts.ProviderStatusSchema.shape.installation.options,
    provider_authentication_status:
      contracts.ProviderStatusSchema.shape.authentication.options,
    provider_compatibility_status:
      contracts.ProviderStatusSchema.shape.compatibility.options,
    task_error_code: contracts.TaskErrorCodeSchema.options,
    provider_setup_status: contracts.ProviderSetupStatusSchema.options,
    provider_setup_stage: contracts.ProviderSetupStageSchema.options,
    provider_setup_error_code:
      contracts.ProviderSetupErrorCodeSchema.options,
  };
}

export async function checkContractEnumParity({
  migrationPaths = ENUM_MIGRATIONS,
  contractEnums,
} = {}) {
  const expectedEnums = contractEnums ?? (await loadContractEnums());
  const sqlEnums = await parseSqlEnumsFromFiles(migrationPaths);
  return compareContractEnums(sqlEnums, expectedEnums);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const errors = await checkContractEnumParity();
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(error);
      }
      process.exitCode = 1;
    } else {
      console.log(
        "contract enum parity: SQL and @meld/contracts values match exactly",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
