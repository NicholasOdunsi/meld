import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/VStack";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppFrame } from "@/ui/app-frame";
import {
  getFakeOrganizationContext,
  isWorkspaceFakeEnabled,
} from "@/features/workspaces/e2e-fake";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  if (isWorkspaceFakeEnabled()) {
    const context = await getFakeOrganizationContext(organizationId);
    if (!context) {
      redirect(
        `/sign-in?next=${encodeURIComponent(
          `/${organizationId}/settings/members`,
        )}`,
      );
    }

    return (
      <AppFrame
        navigation={
          <VStack gap={4} padding={4}>
            <VStack gap={1}>
              <Heading level={3}>Meld</Heading>
              <Heading level={5}>{context.organization.name}</Heading>
            </VStack>
            <Link
              href={`/${organizationId}/discovery`}
              isStandalone
            >
              Discovery
            </Link>
            <Link
              href={`/${organizationId}/settings/members`}
              isStandalone
            >
              Members
            </Link>
          </VStack>
        }
      >
        {children}
      </AppFrame>
    );
  }

  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/${organizationId}/settings/members`,
      )}`,
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  if (!membership || !organization) {
    notFound();
  }

  return (
    <AppFrame
      navigation={
        <VStack gap={4} padding={4}>
          <VStack gap={1}>
            <Heading level={3}>Meld</Heading>
            <Heading level={5}>{organization.name}</Heading>
          </VStack>
          <Link
            href={`/${organizationId}/discovery`}
            isStandalone
          >
            Discovery
          </Link>
          <Link
            href={`/${organizationId}/settings/members`}
            isStandalone
          >
            Members
          </Link>
        </VStack>
      }
    >
      {children}
    </AppFrame>
  );
}
