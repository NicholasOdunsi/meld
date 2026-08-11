export function isMissingModelAwareRpc(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (record.code !== "PGRST202") return false;

  return [record.message, record.details, record.hint].some(
    (value) => typeof value === "string" && value.includes("target_model"),
  );
}
