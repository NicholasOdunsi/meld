import type { ReactNode } from "react";

export type MeldToastStatus = "success" | "warning";

export function MeldToastMessage({
  status,
  children,
}: {
  status: MeldToastStatus;
  children: ReactNode;
}) {
  return <span data-meld-toast-status={status}>{children}</span>;
}

export function meldToastMessage(
  status: MeldToastStatus,
  children: ReactNode,
) {
  return <MeldToastMessage status={status}>{children}</MeldToastMessage>;
}
