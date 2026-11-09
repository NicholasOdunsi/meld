import { normalizeTodoText, TODO_TEXT_MAX } from "@meld/contracts";
import { z } from "zod";

export const FactBundleSchema = z.object({
  messages: z.array(z.object({ room: z.string(), from: z.enum(["you", "orion"]), text: z.string(), at: z.string() })).default([]),
  decisions: z.array(z.object({ room: z.string(), summary: z.string(), at: z.string() })).default([]),
  prds: z.array(z.object({ room: z.string(), version: z.number(), status: z.string(), at: z.string() })).default([]),
  screens: z.array(z.object({ room: z.string(), name: z.string(), state: z.string(), at: z.string() })).default([]),
  tasks: z.array(z.object({ room: z.string(), kind: z.string(), status: z.string(), at: z.string() })).default([]),
  open_todos: z.array(z.string()).default([]),
  known_todos: z.array(z.string()).default([]),
});
export type FactBundle = z.infer<typeof FactBundleSchema>;

export type ProjectFacts = {
  projectId: string;
  projectName: string;
  summary: string;
  since: string;
  activityCount: number;
  facts: FactBundle;
};

const DEFAULT_MAX_WORDS = 6000;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Plain-text brief for the model. Fixed sections first; messages fill the rest, newest first. */
export function renderFacts(project: ProjectFacts, maxWords = DEFAULT_MAX_WORDS): string {
  const { facts } = project;
  const fixed = [
    `Project: ${project.projectName}`,
    `What you knew before: ${project.summary || "(nothing yet)"}`,
    `New since ${project.since}:`,
    ...facts.decisions.map((d) => `- Decision in ${d.room}: ${d.summary}`),
    ...facts.prds.map((p) => `- PRD v${p.version} in ${p.room} is ${p.status}`),
    ...facts.screens.map((s) => `- Screen "${s.name}" in ${s.room} is ${s.state}`),
    ...facts.tasks.map((t) => `- AI work ${t.kind} in ${t.room}: ${t.status}`),
    `Open to-dos already on the list (do not repeat): ${facts.open_todos.join(" | ") || "(none)"}`,
    "Chat, newest first:",
  ];
  const lines = [...fixed];
  let budget = maxWords - words(fixed.join("\n"));
  for (const message of facts.messages) {
    const line = `- [${message.room}] ${message.from}: ${message.text}`;
    const cost = words(line);
    if (cost > budget) break;
    lines.push(line);
    budget -= cost;
  }
  return lines.join("\n");
}

export function filterNewTodos(candidates: string[], known: string[], limit = 5): string[] {
  const seen = new Set(known.map(normalizeTodoText));
  const out: string[] = [];
  for (const raw of candidates) {
    const text = raw.trim();
    const key = normalizeTodoText(text);
    if (!key || text.length > TODO_TEXT_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === limit) break;
  }
  return out;
}
