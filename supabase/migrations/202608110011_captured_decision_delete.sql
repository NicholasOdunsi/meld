-- 202608110009 stopped a captured Decision being hijacked: INSERT may not
-- attach a Decision to a proposal, and UPDATE may neither rewrite one that is
-- attached nor release its link for someone else to claim. DELETE was missed,
-- and DELETE releases the link just as effectively.
--
-- A captured Decision is Room-wide: `capture_proposed_decision` returns the
-- one Decision to every participant who confirms, and each of their
-- `message_proposal_responses` rows says `accepted` and points at it. The
-- participant who happened to confirm first is its `created_by`, so under the
-- pre-existing policy that one participant could delete the artifact everyone
-- else had accepted. Their own response row stays `accepted`, so a client that
-- hides the confirm control after acceptance leaves the rest with no route
-- back to the Decision at all.
--
-- Participants keep full control of the Decisions they wrote themselves; only
-- the ones a proposal produced are protected. `capture_proposed_decision` is
-- security definer and unaffected by this policy.
alter policy "Decision creators can delete decisions"
  on public.decisions
  using (
    created_by = auth.uid()
    and public.is_room_participant(room_id)
    and proposal_message_id is null
  );
