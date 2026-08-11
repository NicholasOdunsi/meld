"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { InviteMemberForm } from "./invite-member-form";
import { getRoleBadgeVariant } from "./product-roles";

export type InviteOnboardingMember = {
  email: string;
  role: string;
};

export type InviteOnboardingInvitation = {
  email: string;
  role: string;
};

function MeldMark() {
  return (
    <Image
      src="/meld-mark.svg"
      alt=""
      width={48}
      height={48}
      priority
    />
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
    <AppShell height="auto" variant="wash" contentPadding={4}>
      <Center
        width="100%"
        minHeight="calc(100dvh - var(--spacing-8))"
      >
        <VStack
          gap={6}
          width="100%"
          maxWidth="calc(var(--spacing-12) * 9)"
        >
          <VStack gap={4} hAlign="center">
            <MeldMark />
            <VStack gap={1} hAlign="center">
              <Heading
                level={1}
                type="display-3"
                justify="center"
                textWrap="balance"
              >
                Invite your team.
              </Heading>
              <Text
                type="large"
                color="secondary"
                display="block"
                justify="center"
                textWrap="balance"
              >
                Add teammates to your Meld workspace
              </Text>
            </VStack>
          </VStack>

          <InviteMemberForm
            workspaceId={workspaceId}
            presentation="onboarding"
          />

          <VStack gap={5}>
            <List
              density="balanced"
              hasDividers
              header={<Heading level={3}>People with access</Heading>}
            >
              {members.map((member) => (
                <ListItem
                  key={member.email}
                  label={member.email}
                  startContent={
                    <Avatar name={member.email} size="md" />
                  }
                  endContent={
                    <Badge
                      variant={getRoleBadgeVariant(member.role)}
                      label={member.role}
                    />
                  }
                />
              ))}
            </List>

            <VStack gap={2}>
              <List
                density="balanced"
                header={<Heading level={3}>Invited people</Heading>}
              >
                {invitations.map((invitation) => (
                  <ListItem
                    key={invitation.email}
                    label={invitation.email}
                    startContent={
                      <Avatar name={invitation.email} size="md" />
                    }
                    endContent={
                      <Badge
                        variant={getRoleBadgeVariant(invitation.role)}
                        label={invitation.role}
                      />
                    }
                  />
                ))}
              </List>
              {invitations.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Invitations will appear here after you send them.
                </Text>
              ) : null}
            </VStack>
          </VStack>

          <HStack gap={2} hAlign="end">
            <Button
              label="Skip for now"
              variant="ghost"
              size="lg"
              onClick={continueToAiSetup}
            />
            <Button
              label="Done"
              variant="primary"
              size="lg"
              onClick={continueToAiSetup}
            />
          </HStack>
        </VStack>
      </Center>
    </AppShell>
  );
}
