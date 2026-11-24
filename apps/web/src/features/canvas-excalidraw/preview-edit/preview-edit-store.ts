import { z } from "zod";
import { FIELDS, MAX_TEXT_RUNS, type Tweak } from "@meld/screen-runtime/edit/types";
import { computedSchema } from "../live/live-messages";

const MAX_FIELD_VALUE_LENGTH = 2_000;

const fieldState = z.object({
  editable: z.boolean(),
  value: z.string().nullable(),
  runs: z.array(z.string()).max(MAX_TEXT_RUNS).optional(),
}).transform((field) => {
  const tooLong = (value: string) => value.length > MAX_FIELD_VALUE_LENGTH;
  if ((field.value !== null && tooLong(field.value)) || field.runs?.some(tooLong)) {
    return { editable: false, value: field.value?.slice(0, MAX_FIELD_VALUE_LENGTH) ?? null };
  }
  return field;
});

const selectionSchema = z.strictObject({
  starId: z.string().min(1).max(80),
  selectionId: z.string().min(1).max(80),
  label: z.string().transform((label) => label.slice(0, 60)),
  tag: z.string().transform((tag) => tag.slice(0, 40)),
  html: z.string().max(600),
  fields: z.record(z.enum(FIELDS), fieldState).nullable(),
  computed: computedSchema,
  reason: z.string().max(300).nullable(),
  locked: z.string().max(300).nullable(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  pending: z.boolean(),
});

export type PreviewSelection = z.infer<typeof selectionSchema>;
export type PreviewRequest =
  | ({ kind: "tweak" } & Tweak)
  | { kind: "undo" | "redo" | "close" }
  | { kind: "describe"; text: string };

type ScopedRequest = PreviewRequest & { selectionId: string };

function parseSelection(json: string | null): PreviewSelection | null {
  if (json === null) return null;
  try {
    const result = selectionSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function createPreviewEditStore() {
  let current: PreviewSelection | null = null;
  let queue: ScopedRequest[] = [];
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setFromJson(json: string | null) {
      const next = parseSelection(json);
      if (next === null && current === null) return;
      if (next?.selectionId !== current?.selectionId) queue = [];
      current = next;
      listeners.forEach((listener) => listener());
    },
    enqueue(selectionId: string, request: PreviewRequest) {
      if (current?.selectionId === selectionId) queue.push({ ...request, selectionId });
    },
    take() {
      const requests = queue;
      queue = [];
      return requests;
    },
  };
}

declare global {
  interface Window {
    __orionPreviewEdit?: {
      setSelection(json: string | null): void;
      take(): ScopedRequest[];
    };
  }
}

export function installPreviewEditBridge(win: Window, store: ReturnType<typeof createPreviewEditStore>): () => void {
  const bridge = { setSelection: store.setFromJson, take: store.take };
  win.__orionPreviewEdit = bridge;
  return () => {
    if (win.__orionPreviewEdit === bridge) delete win.__orionPreviewEdit;
    store.setFromJson(null);
  };
}
