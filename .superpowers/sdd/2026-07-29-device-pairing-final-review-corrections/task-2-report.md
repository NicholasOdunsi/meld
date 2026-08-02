# Task 2 Report: Preserve the Usable Pairing Code at Quota

## Result

The pairing-code route now classifies
`DeviceServiceError.code === "too_many_pairing_codes"` as the explicit `400`
contract. The Connect Device UI retains the last valid code as one atomic
snapshot with its expiry and minting provider until a newer request succeeds
with a valid response.

## RED evidence

The focused route and component tests were run before implementation:

```text
Test Files  2 failed (2)
Tests       4 failed | 9 passed (13)
```

- The quota route test received `409` instead of `400`.
- The quota and generic-failure component flows could not find the previous
  `pairing-code` because request start/failure cleared it.
- The provider-switch concurrency flow could not find the previous code while
  a replacement was pending.

## GREEN evidence

The focused route and component tests pass:

```text
Test Files  2 passed (2)
Tests       14 passed (14)
```

The full web package validation passes:

```text
@meld/web test:      53 files, 302 tests passed
@meld/web typecheck: passed
@meld/web lint:      passed
git diff --check:    passed
```

The jsdom suite continues to print its existing canvas, scroll, CSS, and
dependency-sourcemap warnings; none fail the suite.

## Fix round 1/5 reviewer evidence

The first scoped review found one Important mutation-sensitivity gap and one
Minor snapshot-coherence gap. The follow-up changed tests only:

- The expired retry flow now mints a Codex code, attempts and fails a Claude
  replacement, advances the preserved Codex code to expiry, retries, and
  asserts the final request body contains `requestedProvider: "codex"`.
  Successful retry assertions cover the replacement code, terminal command,
  Codex label, countdown, and cleared prior error.
- The in-flight provider-switch flow now asserts the preserved terminal command
  and countdown alongside the old code and Codex label.
- A malformed latest `2xx` response now proves that response validation must
  succeed before the code, expiry, command, or provider can be replaced; the
  generic error is shown while the original snapshot remains usable.

Post-fix validation:

```text
Pairing-code route: 4 tests passed
Connect Device:     10 tests passed
Full web suite:     53 files, 302 tests passed
Typecheck:          passed
Lint:               passed
git diff --check:   passed
```

No production change was necessary because the existing implementation already
passed the mutation-sensitive cases.

## API contract

Exact quota response:

```json
{
  "error": "Use the pairing code already on screen before generating another one."
}
```

The status is `400`, and classification uses the typed
`DeviceServiceError.code`. Unrelated service errors retain the generic `409`
body. Authentication, request validation, and success paths are unchanged.

## UI state transitions

- Request start records only the in-flight provider, starts loading, and clears
  the previous error. It does not clear the visible code.
- A quota `400` preserves the visible code, expiry, command, and provider label
  and shows the server's stable guidance.
- Any unrelated request, parsing, or transport failure preserves the visible
  code and shows the existing generic retry copy.
- A latest successful response is validated and then installs
  `{ code, expiresAt, provider }` in one state update, so the command and
  provider label change together.
- The expired-code retry uses the provider stored on the visible code rather
  than the last button clicked.

## Stale-request evidence

- An older successful Claude response arriving after the latest Codex quota
  failure cannot replace the original Codex code, drift its provider label, or
  clear the latest quota guidance.
- An older failed Claude response arriving after the latest Codex success
  cannot replace the new code/provider or add a stale generic error.

## Files changed

- `apps/web/src/app/api/devices/pairing-codes/route.ts`
- `apps/web/src/app/api/devices/pairing-codes/route.test.ts`
- `apps/web/src/features/ai/components/connect-device.tsx`
- `apps/web/src/features/ai/components/connect-device.test.tsx`
- `.superpowers/sdd/2026-07-29-device-pairing-final-review-corrections/task-2-report.md`

## Self-review

- The API does not inspect or expose database text.
- The UI only accepts the exact quota guidance from a `400`; malformed or
  unrelated error bodies fall back to generic copy.
- Successful bodies are checked for a non-empty code and valid expiry before
  replacing recoverable state.
- Request IDs gate all success, error, and loading writes.
- No raw layout elements, raw style values, or new Astryx component APIs were
  introduced.
- The scoped diff has no whitespace errors.

## Concerns

No task blocker remains. The stable quota copy is intentionally duplicated in
the route and client because importing a route module into a client component
would cross the server boundary, while introducing a new shared contract file
would widen this fix beyond the scoped files.
