"use client";

import dynamic from "next/dynamic";

export const UserFlowTrialTab = dynamic(
  () => import("./user-flow-trial-tab").then((module) => module.UserFlowTrialTab),
  { ssr: false },
);
