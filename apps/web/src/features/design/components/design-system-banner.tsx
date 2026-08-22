"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { useRef, useState } from "react";
import { resolveMimeType } from "@/features/rooms/attachment-mime";
import { useDesignProfileDistillation } from "../use-design-profile-distillation";

const ACCEPTED_MIME_TYPES: Record<string, boolean> = {
  "text/plain": true,
  "text/markdown": true,
  "text/html": true,
  "application/pdf": true,
};
const ACCEPT_ATTR =
  ".md,.txt,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf";

// Where the banner is standing, which decides how much it is allowed to say.
// `compact` is the Canvas Agents panel -- a narrow column where the icon and a
// description squeeze the title into a one-word-per-line ribbon. `roomy` is the
// Room composer, which has the width to carry the full thing.
export type DesignSystemBannerVariant = "compact" | "roomy";

const ROOMY_DESCRIPTION =
  "Without one, generated screens will each invent their own look.";

export function DesignSystemBanner({
  roomId,
  onResolved,
  variant = "compact",
  isDistillingElsewhere = false,
}: {
  roomId: string;
  onResolved?: () => void | Promise<void>;
  variant?: DesignSystemBannerVariant;
  /**
   * A distill this banner did not start is already running in the room -- from
   * a previous page load, or from someone else. Reported the same way as our
   * own, so nobody is invited to queue a second one on top of it.
   */
  isDistillingElsewhere?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const distillation = useDesignProfileDistillation({ roomId, onResolved });

  if (dismissed) return null;

  const handleFile = (file: File) => {
    // Browsers frequently report an empty/generic MIME type for .md files
    // (and others); fall back to the extension-derived type so those aren't
    // silently rejected -- see attachment-mime.ts.
    const mimeType = resolveMimeType(file.name, file.type);
    if (!ACCEPTED_MIME_TYPES[mimeType]) return;
    void file.arrayBuffer().then((buffer) => {
      void distillation.upload({
        fileName: file.name,
        mimeType,
        bytes: new Uint8Array(buffer),
      });
    });
  };

  const isBusy =
    distillation.status === "uploading" ||
    distillation.status === "distilling" ||
    isDistillingElsewhere;

  // Short single-line title, no description, and a one-word "Upload" action
  // so the Banner header never wraps one-word-per-line in the narrow Agents
  // panel -- the long "Upload design system" label was eating the whole row
  // and squeezing the text into a tiny column.
  const title = isBusy
    ? "Distilling your design system…"
    : distillation.status === "failed" && distillation.message
      ? distillation.message
      : "No design system yet";

  const isRoomy = variant === "roomy";

  return (
    <VStack
      gap={0}
      data-testid="design-system-banner"
      // Inset from whatever is holding it, so the banner reads as a card
      // sitting above the composer rather than a stripe welded to the panel's
      // edge. The narrow variant can't spare the width.
      //
      // Nothing on the bottom, deliberately: the Room composer's own VStack
      // already puts spacing-2 (8px) between this and the field, which is the
      // whole gap we want. Any padding here would stack on top of it and open
      // a blank row between the banner and the thing it is talking about.
      style={
        isRoomy
          ? {
              paddingTop: "var(--spacing-2)",
              paddingLeft: "var(--spacing-2)",
              paddingRight: "var(--spacing-2)",
              paddingBottom: "var(--spacing-0)",
              // The Room composer's agent peeks up from behind it, absolutely
              // positioned at z-index 0 and later in the DOM -- so by default
              // the mascot lands on top of this banner's corner. Own the
              // stacking order instead and let it duck behind: a static box
              // can't be raised by z-index alone, hence `relative`.
              position: "relative",
              zIndex: 1,
            }
          : undefined
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) handleFile(file);
          event.currentTarget.value = "";
        }}
      />
      <Banner
        // Warning, not info, for two reasons. It sits directly above the Room
        // composer, whose focus ring is blue -- an info banner is blue too, so
        // stacked they read as one tall control instead of a notice above a
        // field. And it is the more honest status: nothing has failed, but
        // generating screens without a design system does cost you something,
        // which is exactly what a warning is for.
        status="warning"
        title={title}
        // Only the idle ask needs explaining. Once it's distilling, or it has
        // failed, the title is already the whole message.
        description={
          isRoomy && !isBusy && distillation.status !== "failed"
            ? ROOMY_DESCRIPTION
            : undefined
        }
        // An empty node in the icon slot drops the status glyph, giving the
        // title more room in the narrow Agents panel (the slot always renders,
        // so this is the way to suppress the icon). Roomy keeps Astryx's
        // default info icon, matching every other banner in the app.
        icon={isRoomy ? undefined : <></>}
        isDismissable
        onDismiss={() => setDismissed(true)}
        endContent={
          isBusy ? undefined : (
            <Button
              // One word in both variants. The description already names what
              // is being uploaded, so spelling it out again on the button only
              // widens the row -- and in the narrow Canvas panel the long
              // label squeezed the title into a one-word-per-line column.
              label="Upload"
              size="sm"
              // Uploading a design system is the one thing this banner exists
              // to ask for, so where there's room it looks like the action it
              // is rather than a muted afterthought.
              variant={isRoomy ? "primary" : "secondary"}
              isDisabled={isBusy}
              onClick={() => inputRef.current?.click()}
            />
          )
        }
      />
    </VStack>
  );
}
