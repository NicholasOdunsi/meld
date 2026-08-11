import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "pgsql-parser";
import { tsImport } from "tsx/esm/api";

export const AI_TASK_MIGRATION =
  "supabase/migrations/202607280001_ai_tasks.sql";
export const PROVIDER_SETUP_MIGRATION =
  "supabase/migrations/202607290001_provider_setup.sql";
export const ROOM_AGENT_MESSAGES_MIGRATION =
  "supabase/migrations/202607290002_room_agent_messages.sql";
export const PRD_SECTION_PROPOSALS_MIGRATION =
  "supabase/migrations/202608080001_prd_section_proposals.sql";
export const PRD_SECTION_ASSISTANCE_MIGRATION =
  "supabase/migrations/202608080005_prd_section_assistance.sql";
export const RESEARCH_AGENT_MIGRATION =
  "supabase/migrations/202608090001_research_agent.sql";
export const USER_FLOW_TASK_KIND_MIGRATION =
  "supabase/migrations/202608100000_user_flow_task_kind.sql";
export const ROOM_STAGE_MIGRATION =
  "supabase/migrations/202608110003_room_stage.sql";

// Every migration that declares or extends an enum the TypeScript contracts
// also declare, in filename order. A migration can either create an enum
// (`create type ... as enum (...)`) or extend one created earlier (`alter
// type ... add value ...`); either way, a new one must be added here, or its
// values are simply absent from the SQL side, and the "SQL enum is missing"
// / "SQL is missing contract value" errors below are the only hint -- which
// reads as a missing type rather than a missing file. Order matters: alters
// are applied against whatever the earlier entries in this list have
// already declared, so a migration that creates an enum must come before
// any migration that alters it.
export const ENUM_MIGRATIONS = [
  AI_TASK_MIGRATION,
  PROVIDER_SETUP_MIGRATION,
  ROOM_AGENT_MESSAGES_MIGRATION,
  PRD_SECTION_PROPOSALS_MIGRATION,
  PRD_SECTION_ASSISTANCE_MIGRATION,
  RESEARCH_AGENT_MIGRATION,
  USER_FLOW_TASK_KIND_MIGRATION,
  ROOM_STAGE_MIGRATION,
];

function enumName(typeName) {
  return typeName.map(({ String: value }) => value.sval).join(".");
}

/**
 * Parses one SQL source, applying its `create type ... as enum (...)` and
 * `alter type ... add value ...` statements in AST order against an
 * optional map of enums already known from earlier migrations.
 *
 * `add value ... before 'x'` / `after 'x'` positioning is not honoured: the
 * result is an unordered set of values per enum, which matches
 * `compareContractEnums` below, which already compares via `Set` rather
 * than array order.
 *
 * @param {string} source
 * @param {Record<string, readonly string[]>} [knownEnums] enums already
 *   declared by earlier migrations, keyed by unqualified name
 * @returns {Promise<Record<string, string[]>>}
 */
export async function parseSqlEnums(source, knownEnums = {}) {
  const tree = await parse(source);
  const enums = {};
  for (const [name, values] of Object.entries(knownEnums)) {
    enums[name] = [...values];
  }

  for (const { stmt } of tree.stmts) {
    const createEnum = stmt.CreateEnumStmt;
    if (createEnum) {
      const name = enumName(createEnum.typeName).replace(/^public\./, "");
      if (enums[name]) {
        throw new Error(
          `${name}: SQL enum is declared in more than one migration`,
        );
      }
      enums[name] = createEnum.vals.map(({ String: value }) => value.sval);
      continue;
    }

    // Only `add value` is relevant here: `rename value 'a' to 'b'` also
    // produces an AlterEnumStmt, but sets oldVal alongside newVal, so it is
    // excluded by the oldVal check below rather than mistaken for an add.
    const alterEnum = stmt.AlterEnumStmt;
    if (
      alterEnum &&
      alterEnum.newVal !== undefined &&
      alterEnum.oldVal === undefined
    ) {
      const name = enumName(alterEnum.typeName).replace(/^public\./, "");
      const values = enums[name];
      if (!values) {
        throw new Error(
          `${name}: SQL enum is missing, cannot alter type to add value ` +
            `${JSON.stringify(alterEnum.newVal)}`,
        );
      }
      if (!values.includes(alterEnum.newVal)) {
        values.push(alterEnum.newVal);
      }
    }
  }

  return enums;
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
 * Merges the enums declared and altered across several migrations, in the
 * given order, into one map. Each file's `create type` and `alter type ...
 * add value` statements are applied on top of whatever earlier files in the
 * list already produced, via `parseSqlEnums`'s `knownEnums` parameter --
 * which is also what makes a `create type` for a name declared twice an
 * error rather than a last-one-wins merge (two `create type` statements for
 * the same enum cannot both have applied, so silently keeping one would
 * compare the contracts against a type that does not exist in the
 * database), and an `alter type` for a name never created an error too
 * (it means the creating migration is missing from `paths`).
 *
 * @param {string[]} paths
 * @returns {Promise<Record<string, string[]>>}
 */
export async function parseSqlEnumsFromFiles(paths) {
  let merged = {};

  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`${path}: migration file is missing`);
    }
    merged = await parseSqlEnums(readFileSync(path, "utf8"), merged);
  }

  return merged;
}

export async function loadContractEnums() {
  const contracts = await tsImport("@meld/contracts", import.meta.url);
  return {
    ai_provider: contracts.ProviderSchema.options,
    ai_task_kind: contracts.AITaskKindSchema.options,
    ai_task_status: contracts.AITaskStatusSchema.options,
    ai_agent_kind: contracts.AgentKindSchema.options,
    ai_research_scope: contracts.ResearchScopeSchema.options,
    message_author_type: contracts.MessageAuthorTypeSchema.options,
    provider_installation_status:
      contracts.ProviderStatusSchema.shape.installation.options,
    provider_authentication_status:
      contracts.ProviderStatusSchema.shape.authentication.options,
    provider_compatibility_status:
      contracts.ProviderStatusSchema.shape.compatibility.options,
    task_error_code: contracts.TaskErrorCodeSchema.options,
    room_stage: contracts.RoomStageSchema.options,
    provider_setup_status: contracts.ProviderSetupStatusSchema.options,
    provider_setup_stage: contracts.ProviderSetupStageSchema.options,
    provider_setup_error_code: contracts.ProviderSetupErrorCodeSchema.options,
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
