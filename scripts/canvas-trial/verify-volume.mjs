import { existsSync, mkdirSync, openSync, closeSync, fsyncSync, writeSync, renameSync, unlinkSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const dataDir = resolve(process.argv[2] ?? process.env.MELD_CANVAS_DATA_DIR ?? "");
if (!dataDir) {
  console.error("Usage: verify-volume.mjs <data-directory>");
  process.exit(2);
}

if (existsSync(dataDir) && !statSync(dataDir).isDirectory()) {
  console.error(`Volume path is not a directory: ${dataDir}`);
  process.exit(2);
}

mkdirSync(dataDir, { recursive: true });
if (!statSync(dataDir).isDirectory()) {
  console.error(`Unable to use volume directory: ${dataDir}`);
  process.exit(2);
}
const nonce = `${process.pid}-${Date.now()}`;
const temporaryPath = join(dataDir, `.meld-fsync-${nonce}.tmp`);
const committedPath = join(dataDir, `.meld-fsync-${nonce}.ok`);
const expectedContents = "meld-canvas-trial-fsync\n";
let fileDescriptor;
let directoryDescriptor;
try {
  fileDescriptor = openSync(temporaryPath, "w");
  writeSync(fileDescriptor, Buffer.from(expectedContents));
  fsyncSync(fileDescriptor);
  closeSync(fileDescriptor);
  fileDescriptor = undefined;
  renameSync(temporaryPath, committedPath);
  const reopenedContents = readFileSync(committedPath, "utf8");
  directoryDescriptor = openSync(dataDir, "r");
  fsyncSync(directoryDescriptor);
  closeSync(directoryDescriptor);
  directoryDescriptor = undefined;

  const sqlitePath = join(dataDir, `.meld-pragmas-${nonce}.sqlite`);
  const database = new DatabaseSync(sqlitePath);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
  const journalMode = String(database.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "").toLowerCase();
  const synchronous = Number(database.prepare("PRAGMA synchronous").get()?.synchronous ?? -1);
  const foreignKeys = Number(database.prepare("PRAGMA foreign_keys").get()?.foreign_keys ?? 0);
  database.close();
  unlinkSync(sqlitePath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${sqlitePath}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }

  const result = {
    dataDir,
    fsync: { file: true, atomicRename: true, directory: true },
    contentRoundTrip: reopenedContents === expectedContents,
    sqlite: { journalMode, synchronous, foreignKeys },
    passed: reopenedContents === expectedContents && journalMode === "wal" && synchronous === 2 && foreignKeys === 1,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
} finally {
  if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  for (const path of [temporaryPath, committedPath]) {
    if (existsSync(path)) unlinkSync(path);
  }
}
