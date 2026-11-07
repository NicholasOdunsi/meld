#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MARKER = "-- orion-allow-destructive";
const PATTERNS = [
  /\bdrop\s+table\b[^;]*/gi,
  /\bdrop\s+schema\b[^;]*/gi,
  /\balter\s+table\b[^;]*?\bdrop\s+(column|constraint)\b[^;]*/gi,
  /\btruncate\b[^;]*/gi,
  /\bdelete\s+from\b[^;]*/gi,
];

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

export function findDestructiveStatements(sql) {
  if (sql.includes(MARKER)) return [];
  const body = stripComments(sql);
  return PATTERNS.flatMap((pattern) => [...body.matchAll(pattern)].map((m) => m[0].trim().slice(0, 120)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let failed = false;
  for (const file of process.argv.slice(2)) {
    for (const hit of findDestructiveStatements(readFileSync(file, "utf8"))) {
      console.log(`${file}: ${hit}`);
      failed = true;
    }
  }
  if (failed) {
    console.log(`\nDestructive SQL found. If intended, add "${MARKER}" to the migration and merge again.`);
    process.exit(1);
  }
}
