"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";

export const UserFlowTrialTab = dynamic(
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
