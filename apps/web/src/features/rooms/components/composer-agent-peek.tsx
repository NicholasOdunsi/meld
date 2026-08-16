"use client";

import { Center } from "@astryxdesign/core/Center";
import { MeldBot, type MeldBotEyeOffset } from "@/ui/meld-bot";
import type { AgentKind } from "@meld/contracts";
import { useEffect, useRef, useState } from "react";

const EYE_DEAD_ZONE = 4;

export function ComposerAgentPeek({ kind }: { kind: AgentKind }) {
  const peekRef = useRef<HTMLDivElement>(null);
  const [eyeOffset, setEyeOffset] = useState<MeldBotEyeOffset>(0);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = peekRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const shellBounds = peekRef.current?.parentElement?.getBoundingClientRect();
      const isWithin = (candidate: DOMRect | undefined) =>
        candidate !== undefined &&
        event.clientX >= candidate.left &&
        event.clientX <= candidate.right &&
        event.clientY >= candidate.top &&
        event.clientY <= candidate.bottom;
      if (!isWithin(bounds) && !isWithin(shellBounds)) {
        setEyeOffset(0);
        return;
      }

      const delta = event.clientX - (bounds.left + bounds.width / 2);
      const nextOffset: MeldBotEyeOffset =
        delta < -EYE_DEAD_ZONE
          ? -1
          : delta > EYE_DEAD_ZONE
            ? 1
            : 0;
      setEyeOffset(nextOffset);
    };
    const recenterEyes = () => setEyeOffset(0);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", recenterEyes);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", recenterEyes);
    };
  }, []);

  return (
    <>
      <Center
        ref={peekRef}
        className="composer-agent-peek"
        width="var(--spacing-10)"
        height="var(--spacing-10)"
        data-testid="composer-agent-peek"
        data-agent-kind={kind}
        style={{
          insetBlockStart: 0,
          insetInlineEnd: "var(--spacing-3)",
          pointerEvents: "none",
          position: "absolute",
          transform: "translateY(calc(var(--spacing-8) * -1))",
          zIndex: 0,
        }}
      >
        <MeldBot
          variant={kind}
          appearance="head"
          eyeOffset={eyeOffset}
          data-testid="composer-agent-peek-bot"
        />
      </Center>
      <style jsx global>{`
        .composer-agent-peek {
          animation: composer-agent-peek-rise var(--duration-fast-min)
            steps(2, end) both;
          transform-origin: center bottom;
          will-change: transform;
        }

        @keyframes composer-agent-peek-rise {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(calc(var(--spacing-8) * -1));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .composer-agent-peek {
            animation: none;
            transform: translateY(calc(var(--spacing-8) * -1));
            will-change: auto;
          }
        }
      `}</style>
    </>
  );
}
