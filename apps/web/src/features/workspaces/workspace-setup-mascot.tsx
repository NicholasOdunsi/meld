import { Center } from "@astryxdesign/core/Center";
import Image from "next/image";

export function WorkspaceSetupMascot({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  return (
    <>
      <Center
        aria-hidden="true"
        className="workspace-setup-mascot-stage"
        data-motion={prefersReducedMotion ? "reduced" : "playful"}
        data-testid="workspace-setup-mascot"
        width="calc(var(--spacing-12) * 3.5)"
        height="calc(var(--spacing-12) * 3.5)"
      >
        <Center
          className="workspace-setup-mascot-body"
          width="calc(var(--spacing-12) * 3)"
          height="calc(var(--spacing-12) * 3)"
        >
          <Image
            alt=""
            className="workspace-setup-mascot-image"
            data-testid="workspace-setup-mascot-image"
            src="/mascots/meld-spark.png"
            width={512}
            height={512}
            priority
          />
        </Center>
        <Center
          className="workspace-setup-mascot-shadow"
          width="calc(var(--spacing-12) * 1.25)"
          height="var(--spacing-2)"
        >
          {null}
        </Center>
      </Center>

      <style jsx global>{`
        .workspace-setup-mascot-stage {
          position: relative;
          isolation: isolate;
        }

        .workspace-setup-mascot-body {
          position: relative;
          z-index: 1;
          transform-origin: 50% 88%;
          will-change: transform;
        }

        .workspace-setup-mascot-image {
          display: block;
          width: 100%;
          height: auto;
          object-fit: contain;
        }

        .workspace-setup-mascot-shadow {
          position: absolute;
          bottom: var(--spacing-2);
          z-index: 0;
          border-radius: var(--radius-full);
          background-color: var(--color-shadow);
          filter: blur(var(--spacing-1));
          transform-origin: center;
          will-change: transform, opacity;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-body {
          animation: workspace-setup-mascot-hop
            calc(var(--duration-slow-max) + var(--duration-fast-min))
            var(--ease-standard) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-shadow {
          animation: workspace-setup-mascot-shadow
            calc(var(--duration-slow-max) + var(--duration-fast-min))
            var(--ease-standard) infinite;
        }

        @keyframes workspace-setup-mascot-hop {
          0%,
          12%,
          100% {
            transform: translateY(0) scale(1);
          }
          34% {
            transform: translateY(calc(var(--spacing-4) * -1))
              scaleX(0.96) scaleY(1.04);
          }
          52% {
            transform: translateY(0) scaleX(1.06) scaleY(0.94);
          }
          66% {
            transform: translateY(calc(var(--spacing-1) * -1))
              scaleX(0.99) scaleY(1.01);
          }
          78% {
            transform: translateY(0) scale(1);
          }
        }

        @keyframes workspace-setup-mascot-shadow {
          0%,
          12%,
          52%,
          78%,
          100% {
            opacity: 1;
            transform: scaleX(1);
          }
          34% {
            opacity: 0.54;
            transform: scaleX(0.66);
          }
          66% {
            opacity: 0.82;
            transform: scaleX(0.9);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .workspace-setup-mascot-body,
          .workspace-setup-mascot-shadow {
            animation: none;
            will-change: auto;
          }
        }
      `}</style>
    </>
  );
}
