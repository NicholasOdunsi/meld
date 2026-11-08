"use client";

import { useEffect } from "react";
import { createShelfConnectCode } from "@/features/inspiration/shelf-connection";
import { postToNative, registerNativeHandlers } from "./bridge";

/** Invisible. Lets the Orion Mac app know who is signed in and lets it ask for a Shelf code. */
export function NativeBridge({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    const unregister = registerNativeHandlers({
      requestShelfConnect: () => {
        void createShelfConnectCode(workspaceId)
          .then((result) =>
            postToNative(
              result.status === "created"
                ? { v: 1, type: "shelfConnectCode", code: result.code }
                : { v: 1, type: "shelfConnectFailed", message: result.message },
            ),
          )
          .catch(() => postToNative({ v: 1, type: "shelfConnectFailed", message: "Couldn't make a code. Try again." }));
      },
    });
    postToNative({ v: 1, type: "ready", workspaceId });
    return unregister;
  }, [workspaceId]);

  return null;
}
