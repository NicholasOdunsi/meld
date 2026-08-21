# Room Tab Stability

## Problem

Room tabs are updated from both optimistic client actions and Supabase
Realtime. A create response and its matching realtime INSERT can be applied in
either order, which can append the same tab twice. A late INSERT or UPDATE can
also temporarily restore a tab that the client has already closed. Reloading
then shows the actual database rows, making duplicate or resurrected tabs look
as though tabs were deleted unpredictably.

## Design

Tab lists will merge by tab ID rather than append blindly. The create response
and realtime INSERT therefore converge on one tab regardless of arrival order.

Closing a tab will add its ID to a local pending-close set before the optimistic
removal. Incoming realtime snapshots will be filtered through that set so late
INSERT or UPDATE events cannot restore the tab. The marker is removed when the
realtime list confirms deletion; a failed delete removes the marker and allows
the authoritative server tab to return.

At most five stored work tabs may exist per Room. Overview is generated and has
no `room_tabs` row, so the visible limit is Overview plus five work tabs. The
temporary Conversation tab does not count. The database will serialize tab
creation per Room and reject a sixth row, and the fake backend will enforce the
same rule. The client hides the add button and refuses pane pop-outs at the
limit. Client checks are immediate feedback; the database remains authoritative
for concurrent collaborators.

## Data Flow

1. A create action inserts and returns one tab.
2. Client state upserts that tab by ID.
3. Realtime INSERT upserts the same ID, producing no duplicate.
4. Close marks the ID pending, removes it optimistically, and requests deletion.
5. Realtime DELETE removes the server row and clears the pending marker.

## Error Handling

A rejected sixth-tab create leaves the current tab active. A failed close clears
its pending marker so the server tab becomes visible again. No mutation failure
removes unrelated tabs.

## Verification

Focused tests will cover create/realtime deduplication, late-event filtering for
a closing tab, failed-close restoration, and the five-tab boundary in the Room
plane and fake backend. The Astryx convention check and `git diff --check` will
also run; no broad test suite is required.
