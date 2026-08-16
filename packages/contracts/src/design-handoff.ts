import { z } from "zod";

// One built screen's manifest entry: `create_design_handoff_snapshot`
// (the security-definer RPC) assembles these from `design_screens` at the
// moment a Room moves Design -> Development, so `currentVersionId` mirrors
// that column's nullability directly.
const DesignHandoffManifestScreenSchema = z
  .object({
    screenId: z.string().uuid(),
    name: z.string(),
    currentVersionId: z.string().uuid().nullable(),
  })
  .strict();

export const DesignHandoffManifestSchema = z
  .object({
    screens: z.array(DesignHandoffManifestScreenSchema),
  })
  .strict();
export type DesignHandoffManifest = z.infer<typeof DesignHandoffManifestSchema>;

// The reader-side view of the latest `design_handoff_snapshots` row for a
// Room: an immutable point-in-time snapshot, never re-fetched piecemeal.
export type DesignHandoffView = {
  id: string;
  manifest: DesignHandoffManifest;
  startScreenId: string | null;
  profileVersionId: string | null;
  prdRevision: number | null;
  createdAt: string;
};
