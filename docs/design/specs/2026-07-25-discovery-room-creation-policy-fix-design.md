# Discovery Room Creation Policy Fix

## Problem

Creating a Discovery Room fails with “We could not create the room.”
The authenticated user is an administrator and a valid member of the
workspace, so this is not a form-validation or membership problem.

The existing repository performs an `INSERT ... RETURNING` operation against
`discovery_rooms`. The insert policy allows a workspace member to create a
room they own, while the select policy only allows room participants to read
that room. An after-insert trigger adds the owner to `room_participants`, but
PostgreSQL evaluates the returned row under the select policy before that
participant relationship can make the row visible. The transaction is
therefore rejected by row-level security.

## Requirements

- An authenticated workspace member can create a room they own.
- The room creator automatically receives `edit` participant access.
- A room remains invisible to workspace members who have not been explicitly
  added as participants.
- Creation is atomic: the app must not report failure after leaving a
  partially created room behind.
- The existing form, successful navigation, and safe user-facing error
  behavior remain unchanged.

## Design

Add a narrowly scoped PostgreSQL function for Discovery Room creation. The
function will:

1. Require an authenticated user.
2. Validate and normalize the room name using the same limits enforced by the
   table.
3. Verify that the authenticated user is a member of the requested
   organization.
4. Insert the room with the authenticated user as its owner.
5. Rely on the existing owner-participant trigger to grant the owner `edit`
   access.
6. Return the newly created room after the participant relationship exists.

The function will run as a security definer so it can return the newly created
row without weakening the participant-only select policy. It will use an empty
`search_path`, schema-qualified references, explicit authorization checks, and
restricted execution grants. Anonymous and public execution will be revoked;
only the `authenticated` role may invoke it.

The web repository will call this function through Supabase RPC instead of
calling `.from("discovery_rooms").insert(...).select(...)`. Its public return
type and the server action’s form-state contract will not change.

## Data Flow

1. The room form submits the organization ID and room name.
2. Existing application validation rejects malformed input.
3. The repository retrieves the authenticated user and invokes the database
   creation function.
4. The database rechecks authentication and organization membership.
5. The database creates the room and owner-participant relationship in one
   transaction, then returns the room.
6. The existing client effect navigates to the returned room ID.

## Error Handling

Database authorization, validation, or persistence failures continue to map to
the generic “We could not create the room.” message. Detailed database errors
must not be exposed in the browser. A failed function call rolls back the whole
transaction, including the room and participant rows.

## Testing

- A workspace member can create a room.
- The created room is owned by the caller.
- The caller is automatically added as an `edit` participant.
- An authenticated non-member cannot create a room in the organization.
- A different workspace member cannot read the room until explicitly added.
- Repository tests verify the RPC input and returned room mapping.
- Existing Discovery Room tests remain green.
- A local manual test creates a room and verifies navigation to its
  conversation page.

## Out of Scope

- Changing room participant management.
- Making rooms visible to every workspace member.
- Redesigning the Discovery Room form or error presentation.
- Changing invitation-email delivery.
