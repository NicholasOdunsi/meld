export type InvitationPresentationInput = {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  deliveryStatus: "pending" | "sent" | "failed";
  isAdmin: boolean;
  now?: number;
};

export function getInvitationPresentation({
  acceptedAt,
  revokedAt,
  expiresAt,
  deliveryStatus,
  isAdmin,
  now = Date.now(),
}: InvitationPresentationInput) {
  const isExpired = new Date(expiresAt).getTime() <= now;
  const isUnresolved = !acceptedAt && !revokedAt;

  if (acceptedAt) {
    return {
      state: "Accepted",
      stateVariant: "success" as const,
      canRetry: false,
      canRevoke: false,
    };
  }
  if (revokedAt) {
    return {
      state: "Revoked",
      stateVariant: "neutral" as const,
      canRetry: false,
      canRevoke: false,
    };
  }
  if (isExpired) {
    return {
      state: "Expired",
      stateVariant: "error" as const,
      canRetry: false,
      canRevoke: isAdmin && isUnresolved,
    };
  }
  if (deliveryStatus === "failed") {
    return {
      state: "Delivery failed",
      stateVariant: "error" as const,
      canRetry: isAdmin && isUnresolved,
      canRevoke: isAdmin && isUnresolved,
    };
  }
  if (deliveryStatus === "pending") {
    return {
      state: "Sending",
      stateVariant: "warning" as const,
      canRetry: isAdmin && isUnresolved,
      canRevoke: isAdmin && isUnresolved,
    };
  }
  return {
    state: "Invited",
    stateVariant: "warning" as const,
    canRetry: false,
    canRevoke: isAdmin && isUnresolved,
  };
}
