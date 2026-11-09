"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useIsMounted } from "@/ui/use-is-mounted";
import { useWorkspaceActivity } from "../workspace-activity-provider";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function OverviewHeading({ projectCount }: { projectCount: number }) {
  const { byProject } = useWorkspaceActivity();
  const isMounted = useIsMounted();
  const states = [...byProject.values()];
  const working = states.filter((project) => project.state === "working").length;
  const needsYou = states.filter((project) => project.state === "needs_you").length;
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  return (
    <VStack gap={1}>
      <Heading level={1}>
        {isMounted ? greeting(new Date().getHours()) : "Overview"}
      </Heading>
      <Text type="body" color="secondary">
        {`${plural(projectCount, "project", "projects")} · ${working} working · ${needsYou} ${needsYou === 1 ? "needs" : "need"} you`}
      </Text>
    </VStack>
  );
}
