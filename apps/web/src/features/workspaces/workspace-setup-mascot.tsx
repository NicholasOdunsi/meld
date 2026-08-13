import { Center } from "@astryxdesign/core/Center";
import { MeldBot } from "@/ui/meld-bot";

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
          <MeldBot
            variant="meld"
            className="workspace-setup-mascot-bot"
            data-testid="workspace-setup-mascot-bot"
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
        }

        .workspace-setup-mascot-bot {
          display: block;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .workspace-setup-mascot-bot [data-part] {
          transform-box: fill-box;
          will-change: transform;
        }

        .workspace-setup-mascot-bot [data-part="head"],
        .workspace-setup-mascot-bot [data-part="torso"] {
          transform-origin: center;
        }

        .workspace-setup-mascot-bot [data-part="antenna"] {
          transform-origin: 50% 100%;
        }

        .workspace-setup-mascot-bot [data-part="left-arm"],
        .workspace-setup-mascot-bot [data-part="left-leg"] {
          transform-origin: 80% 10%;
        }

        .workspace-setup-mascot-bot [data-part="right-arm"],
        .workspace-setup-mascot-bot [data-part="right-leg"] {
          transform-origin: 20% 10%;
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
          .workspace-setup-mascot-bot [data-part="head"],
        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="torso"] {
          animation: workspace-setup-mascot-idle
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="antenna"] {
          animation: workspace-setup-mascot-antenna
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="left-arm"] {
          animation: workspace-setup-mascot-left-arm
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="right-arm"] {
          animation: workspace-setup-mascot-right-arm
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="left-leg"] {
          animation: workspace-setup-mascot-left-leg
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-bot [data-part="right-leg"] {
          animation: workspace-setup-mascot-right-leg
            calc(var(--duration-slow-max) * 2) steps(2, end) infinite;
        }

        .workspace-setup-mascot-stage[data-motion="playful"]
          .workspace-setup-mascot-shadow {
          animation: workspace-setup-mascot-shadow
            calc(var(--duration-slow-max) + var(--duration-fast-min))
            var(--ease-standard) infinite;
        }

        @keyframes workspace-setup-mascot-idle {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(calc(var(--spacing-0-5) * -0.5));
          }
        }

        @keyframes workspace-setup-mascot-antenna {
          0%,
          100% {
            transform: translateY(0) rotate(-3deg);
          }
          50% {
            transform: translateY(calc(var(--spacing-0-5) * -0.5))
              rotate(3deg);
          }
        }

        @keyframes workspace-setup-mascot-left-arm {
          0%,
          100% {
            transform: rotate(0);
          }
          50% {
            transform: rotate(-5deg);
          }
        }

        @keyframes workspace-setup-mascot-right-arm {
          0%,
          100% {
            transform: rotate(0);
          }
          50% {
            transform: rotate(5deg);
          }
        }

        @keyframes workspace-setup-mascot-left-leg {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(calc(var(--spacing-0-5) * -1));
          }
        }

        @keyframes workspace-setup-mascot-right-leg {
          0%,
          100% {
            transform: translateY(calc(var(--spacing-0-5) * -1));
          }
          50% {
            transform: translateY(0);
          }
        }

        @keyframes workspace-setup-mascot-shadow {
          0%,
          100% {
            opacity: 1;
            transform: scaleX(1);
          }
          50% {
            opacity: 0.82;
            transform: scaleX(0.92);
          }
        }

        .workspace-setup-mascot-stage[data-motion="reduced"]
          .workspace-setup-mascot-bot [data-part],
        .workspace-setup-mascot-stage[data-motion="reduced"]
          .workspace-setup-mascot-shadow {
          animation: none;
          will-change: auto;
        }

        @media (prefers-reduced-motion: reduce) {
          .workspace-setup-mascot-bot [data-part],
          .workspace-setup-mascot-shadow {
            animation: none;
            will-change: auto;
          }
        }
      `}</style>
    </>
  );
}
