export function getApplicationOrigin() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(configuredOrigin);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
  }

  return url.origin;
}
