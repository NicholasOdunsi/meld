// Next redacts the message of an error thrown out of a Server Action in a
// production build, replacing it with a generic string and attaching a
// `digest`. A `catch (reason) { setError(reason.message) }` therefore renders
// friendly copy in development and Next's placeholder in the deployed app --
// the failure mode that made CREATE_PROJECT_ERROR, RENAME_PROJECT_ERROR and
// MOVE_ROOM_ERROR dead code, and that unit tests cannot see because they mock
// the action to reject with the friendly string directly.
//
// The durable fix is for an action to *return* its outcome rather than throw
// it, which is what `deleteProject` and `createRoomFromForm` already do. This
// is the last-resort branch for the thrown case: it trusts a message only when
// it is one an action deliberately produced, and falls back otherwise.
export function actionErrorMessage(
  reason: unknown,
  fallback: string,
): string {
  if (!(reason instanceof Error) || !reason.message) {
    return fallback;
  }
  // Next stamps a `digest` onto every error it redacted on the way across the
  // boundary. An error the client itself constructed never has one.
  if (typeof (reason as { digest?: unknown }).digest === "string") {
    return fallback;
  }
  return reason.message;
}
