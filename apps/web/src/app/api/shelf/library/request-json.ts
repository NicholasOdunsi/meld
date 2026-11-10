import type { z } from "zod";

// Reads and validates a JSON body; any failure is just "no valid body".
export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
