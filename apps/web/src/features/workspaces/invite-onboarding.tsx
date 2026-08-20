"use client";

import { useRouter } from "next/navigation";
import { InviteMemberForm } from "./invite-member-form";
import { getRoleTone } from "./product-roles";
import { MeldAuthShell } from "@/ui/meld/auth-shell";
import { MeldAvatar } from "@/ui/meld/avatar";
import { MeldBadge } from "@/ui/meld/badge";
import { MeldButton } from "@/ui/meld/button";
import { MeldList, MeldListItem } from "@/ui/meld/list";
import { MeldActions, MeldNote, MeldSection } from "@/ui/meld/stack";

export type InviteOnboardingMember = {
  email: string;
  role: string;
};

export type InviteOnboardingInvitation = {
  email: string;
  role: string;
};

function PeopleSection({
  title,
  people,
  emptyMessage,
}: {
  title: string;
  people: readonly { email: string; role: string }[];
  emptyMessage?: string;
}) {
  return (
    <MeldSection title={title}>
      {people.length > 0 ? (
        <MeldList>
          {people.map((person) => (
            <MeldListItem
              key={person.email}
              label={person.email}
              start={<MeldAvatar name={person.email} />}
              end={
                <MeldBadge
                  label={person.role}
                  tone={getRoleTone(person.role)}
                />
              }
            />
          ))}
        </MeldList>
      ) : emptyMessage ? (
        <MeldNote>{emptyMessage}</MeldNote>
      ) : null}
    </MeldSection>
  );
}

export function InviteOnboarding({
  workspaceId,
  members,
  invitations,
}: {
  workspaceId: string;
  members: InviteOnboardingMember[];
  invitations: InviteOnboardingInvitation[];
}) {
  const router = useRouter();
  const continueToAiSetup = () =>
    router.push(`/onboarding/${workspaceId}/ai`);

  return (
    <MeldAuthShell
      title="Invite your team."
      subtitle="Add teammates to your Meld workspace"
      width="wide"
    >
      <InviteMemberForm workspaceId={workspaceId} presentation="onboarding" />

      <PeopleSection title="People with access" people={members} />
      <PeopleSection
        title="Invited people"
        people={invitations}
        emptyMessage="Invitations will appear here after you send them."
      />

      <MeldActions>
        <MeldButton
          label="Skip for now"
          variant="secondary"
          size="lg"
          onClick={continueToAiSetup}
        />
        <MeldButton
          label="Done"
          variant="primary"
          size="lg"
          onClick={continueToAiSetup}
        />
      </MeldActions>
    </MeldAuthShell>
  );
}
