"use client";

import { Timestamp } from "@astryxdesign/core/Timestamp";
import { type ComponentProps } from "react";
import { useIsMounted } from "./use-is-mounted";

// Astryx's Timestamp resolves Intl.DateTimeFormat(undefined, ...) for its
// accessible label, which reads the server's Node locale during SSR and the
// browser's locale on the client. When they differ, the label text differs
// too, and React flags a hydration mismatch -- Timestamp exposes no locale
// prop to pin this at the call site. Deferring the render until after mount
// sidesteps it: server and the pre-hydration client pass both render
// nothing, and the real timestamp appears once mounted, which is the
// standard-safe pattern for a value that legitimately differs between
// server and client.
export function ClientTimestamp(props: ComponentProps<typeof Timestamp>) {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <Timestamp {...props} />;
}
