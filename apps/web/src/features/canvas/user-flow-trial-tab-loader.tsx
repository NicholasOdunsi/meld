"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useState } from "react";
import glowStyles from "./user-flow-generating-glow.module.css";
import type { UserFlowTrialTabProps } from "./user-flow-trial-tab";

const UserFlowTrialTabContent = dynamic<UserFlowTrialTabProps>(
  () => import("./user-flow-trial-tab").then((module) => module.UserFlowTrialTab),
  {
    ssr: false,
    loading: () => (
      <VStack width="100%" height="fill" hAlign="center" vAlign="center">
        <Spinner size="sm" label="Loading User Flows" />
      </VStack>
    ),
  },
);

export function UserFlowTrialTab(props: UserFlowTrialTabProps) {
  const [isClientReady, setIsClientReady] = useState(false);
  const handleClientReady = useCallback(() => setIsClientReady(true), []);
  const isPreparingGeneration =
    Boolean(props.initialGenerationTaskId) && !isClientReady;

  return (
    <VStack
      width="100%"
      height="100%"
      minHeight="var(--spacing-0)"
      data-generating={isPreparingGeneration}
      className={isPreparingGeneration ? glowStyles.glow : undefined}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <UserFlowTrialTabContent
        {...props}
        onClientReady={handleClientReady}
      />
    </VStack>
  );
}
