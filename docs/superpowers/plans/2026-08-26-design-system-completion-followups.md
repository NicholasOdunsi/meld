# Design system completion — follow-ups

Everything here was found during implementation, judged non-blocking, and
deliberately left. Recorded so it is a decision rather than an oversight.

## Worth doing next

- **A finished pass is invisible until a reload.** Nothing revalidates or polls
  the Design System page, so a pass that completes while the page is open shows
  nothing until the person refreshes. The refusals now have distinct messages;
  the live update does not exist.
- **`component_css` written before the SQL compiler landed is stale** on any
  version row created by earlier commits on this branch. The feature never
  shipped, and the next pass recomputes it, so there is no backfill.
- **The 48 KiB component-CSS cap is pinned on one side only.** SQL
  (`compile_design_component_css`) and TypeScript (`compileComponentCss`) must
  agree byte for byte; a shared fixture pins the format, but only the pgTAP test
  asserts the cutoff. Editing `MAX_COMPONENT_CSS_TOTAL_BYTES` would break parity
  silently. One TypeScript assertion closes it.
- **Parity rests on two tests, not one implementation.** SQL is authoritative for
  the stored stylesheet; the TypeScript compiler still exists for the distiller's
  own output. Worth revisiting if they drift.
- **`start_design_component_build` keeps an unused `target_provider` parameter.**
  The provider is resolved from the device now. The parameter is a trap for a
  future caller; a signature cleanup would remove it.

## Deliberately accepted

- **The provider connection check is existence-only**, matching what
  `create_ai_task` enforces. A provider that is connected but signed out can
  still be chosen; the readiness check at the UI layer is what narrows this.
- **A parked (`needs_review`) batch releases the pass**, so a manually resumed
  batch can overlap a newly queued one. Bounded to one duplicated run over at
  most four components by the two-attempt ceiling.
- **The auto-queue after a distillation degrades to a server-log warning** if it
  fails. An exception there would abort `settle_ai_task` and wedge the task,
  which is worse. Worth a monitoring note rather than a code change.
- **A distillation landing mid-pass resumes the stale pass** rather than starting
  one against the new profile. Recoverable with the button, but silent.

## Pre-existing, not from this work

- `pnpm check:astryx` reports 7 violations that predate this branch, in
  `agents-transcript.tsx`, `design-system-banner.tsx`, `prototype-screen-pill.tsx`,
  `prototype-viewer.tsx`, `design-screen-generation.test.ts` and
  `room-plane.test.tsx`. Note that `check:astryx` is NOT part of `pnpm test` —
  `test:astryx` only tests the checker itself — so no gate catches them.

## A note for whoever adds the next AI task kind

It needs registering in **six** places. Five are visible to the typechecker;
`validateTaskResult` in `provider-adapter.ts` is an if-chain that is not, and
`ENUM_MIGRATIONS` in `scripts/check-contract-enum-parity.mjs` is a hardcoded
list. Both were missed during this work and caught only by review and a red gate.
