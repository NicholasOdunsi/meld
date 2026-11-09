import { useId, type SVGProps } from "react";

export type OrionTalkingHatExpression = "neutral" | "curious" | "speaking";

export interface OrionTalkingHatProps extends SVGProps<SVGSVGElement> {
  expression?: OrionTalkingHatExpression;
  appearance?: "illustration" | "avatar";
  decorative?: boolean;
}

/** A self-contained Orion mascot. The face is cut and folded into the hat itself. */
export function OrionTalkingHat({
  expression = "neutral",
  appearance = "illustration",
  decorative = false,
  width = 320,
  height = 320,
  ...props
}: OrionTalkingHatProps) {
  const id = useId().replace(/:/g, "");
  const avatar = appearance === "avatar";
  const curious = expression === "curious";
  const crown = `${id}-crown`;
  const brim = `${id}-brim`;
  const fold = `${id}-fold`;
  const mouth = `${id}-mouth`;
  const grain = `${id}-grain`;

  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 320"
      width={width}
      height={height}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : props["aria-label"] ?? "Orion talking hat"}
      data-expression={expression}
      data-appearance={appearance}
    >
      <defs>
        <linearGradient id={crown} x1="0" y1="0" x2="1" y2="0.8">
          <stop stopColor="#a7754b" />
          <stop offset=".27" stopColor="#70462f" />
          <stop offset=".62" stopColor="#8a5838" />
          <stop offset="1" stopColor="#38281f" />
        </linearGradient>
        <linearGradient id={brim} x1="0" y1="0" x2=".4" y2="1">
          <stop stopColor="#b58456" />
          <stop offset=".5" stopColor="#76492f" />
          <stop offset="1" stopColor="#33271f" />
        </linearGradient>
        <linearGradient id={fold} x1="0" y1="0" x2=".2" y2="1">
          <stop stopColor="#d5a36c" />
          <stop offset=".45" stopColor="#93613f" />
          <stop offset="1" stopColor="#513426" />
        </linearGradient>
        <linearGradient id={mouth} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#201813" />
          <stop offset="1" stopColor="#533026" />
        </linearGradient>
        {!avatar && (
          <pattern id={grain} width="17" height="19" patternUnits="userSpaceOnUse">
            <path d="m2 5 2-2m8 10 2-3m-8 8 1-2" stroke="#f4c895" strokeOpacity=".13" strokeWidth=".7" />
          </pattern>
        )}
      </defs>
      <style>{`
        @keyframes orion-hat-speak-${id} {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(.65); }
        }
        [data-part="mouth"] {
          transform-box: fill-box;
          transform-origin: center top;
        }
        [data-expression="speaking"] [data-part="mouth"] {
          animation: orion-hat-speak-${id} 720ms ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-expression="speaking"] [data-part="mouth"] { animation: none; }
        }
      `}</style>

      {/* The broad, irregular brim remains readable as a hat at small sizes. */}
      <path data-part="brim" d="M25 288c34-24 74-35 124-38 74-5 102 10 152-8 18-6 34-9 41-3 9 8-8 29-34 40-42 18-108 19-156 22-58 5-111 14-139 9-13-2-9-13 12-22Z" fill={`url(#${brim})`} stroke="#38281f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M25 305c86-17 153-13 221-19 39-3 63-9 87-25" fill="none" stroke="#d0a071" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
      <path d="M61 278c65-13 128-12 195-4 20 2 39 1 53-5" fill="none" stroke="#2a211c" strokeOpacity=".65" strokeWidth="5" strokeLinecap="round" />

      {/* Bent peak and pinched crown are one continuous leather silhouette. */}
      <path data-part="crown" d="M69 263c4-30 9-57 16-82 8-31 24-54 31-84 5-22 1-38-10-52C97 34 83 29 80 21c-4-11 13-15 35-13 39 4 70 24 80 51 6 17 12 28 24 40 16 17 35 33 47 60 15 34 18 72 21 101 2 22-21 34-49 38-48 8-113 1-149-8-18-5-24-14-20-27Z" fill={`url(#${crown})`} stroke="#3a281f" strokeWidth="4" strokeLinejoin="round" />
      <path d="M82 23c24 10 48 35 48 65 0 21-12 40-19 61 23-25 51-41 82-38-8-22-12-42-22-59-14-25-53-44-89-29Z" fill="#2e211b" opacity=".38" />
      <path d="M85 21c21 3 43 19 52 35" fill="none" stroke="#d0a073" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
      <path d="M162 71c11 20 9 37 18 52 10 17 29 21 46 40" fill="none" stroke="#c08b59" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
      <path d="M99 141c-16 37-23 75-20 107 3 19 15 32 44 39" fill="none" stroke="#d0a071" strokeOpacity=".37" strokeWidth="5" strokeLinecap="round" />
      {!avatar && (
        <>
          <path data-part="grain" d="M69 263c4-30 9-57 16-82 8-31 24-54 31-84 5-22 1-38-10-52C97 34 83 29 80 21c-4-11 13-15 35-13 39 4 70 24 80 51 6 17 12 28 24 40 16 17 35 33 47 60 15 34 18 72 21 101 2 22-21 34-49 38-48 8-113 1-149-8-18-5-24-14-20-27Z" fill={`url(#${grain})`} />
          <path d="M183 104c-7 18-2 24 7 29m18-19c-8 18-3 24 6 29m21-4c-6 14-2 21 5 24" fill="none" stroke="#bc8a61" strokeWidth="4" strokeLinecap="round" opacity=".72" />
          <path d="M123 218c-6 12-8 21-3 28m148-20c4 11 3 18-3 24" fill="none" stroke="#d0a071" strokeWidth="2" strokeDasharray="3 5" opacity=".55" />
        </>
      )}

      {/* The brows cast the eye sockets into the leather; there are no separate eyeballs. */}
      <g data-part="left-brow" transform={curious ? "translate(2 -13) rotate(-7 140 185)" : undefined}>
        <path d="M97 181c22-19 46-18 69-5 13 8 16 15 18 21-19-8-34-13-50-9-15 3-25 8-39 4Z" fill="#32231d" opacity=".78" />
        <path d="M94 179c20-17 43-19 66-10 15 6 20 13 24 22-20-10-38-15-55-12-13 2-23 7-35 8Z" fill={`url(#${fold})`} stroke="#563827" strokeWidth="2" strokeLinejoin="round" />
        <path d={curious ? "M111 196c17-7 35-7 52 0" : "M111 194c17 8 34 7 52 1"} fill="none" stroke="#251c18" strokeWidth={avatar ? 5 : 4} strokeLinecap="round" />
      </g>
      <path d="M186 194c14-16 34-23 55-23 19 0 34 9 43 18-13 6-26 9-42 7-18-4-35-1-56 7Z" fill="#32231d" opacity=".78" />
      <path d="M187 188c16-14 36-20 55-19 18 0 33 8 44 18-15 2-28 3-44 2-19-3-35 0-55 8Z" fill={`url(#${fold})`} stroke="#563827" strokeWidth="2" strokeLinejoin="round" />
      <path d="M210 198c19-8 41-7 58-2" fill="none" stroke="#251c18" strokeWidth={avatar ? 5 : 4} strokeLinecap="round" />
      <path d="M178 199c-1 12-6 19-16 25 15-4 25-1 34 3" fill="none" stroke="#d2a171" strokeOpacity=".58" strokeWidth="4" strokeLinecap="round" />

      {/* Mouth opening and lower lip are folds in the same crown material. */}
      {expression === "speaking" ? (
        <path data-part="mouth" d="M112 240c41-19 97-27 139-12 16 6 24 19 18 31-7 14-29 24-58 27-43 4-84-4-100-19-8-8-8-19 1-27Z" fill={`url(#${mouth})`} stroke="#34231b" strokeWidth="4" />
      ) : (
        <path data-part="mouth" d={curious ? "M152 247c22-11 52-15 78-10 15 3 26 10 30 17-22-5-45-6-67-1-16 3-29 7-41 9Z" : "M110 245c41-17 88-25 130-19 18 3 30 9 37 17-25-6-50-6-83 1-34 6-60 15-84 19Z"} fill={`url(#${mouth})`} stroke="#35231b" strokeWidth="3" />
      )}
      <path d={expression === "speaking" ? "M111 269c26 16 73 22 112 16 24-4 42-12 49-24-7 28-26 39-68 43-44 3-80-8-93-35Z" : "M111 264c31-3 59-15 87-18 29-5 55-4 75 1-8 27-27 37-68 42-43 4-78-4-94-25Z"} fill={`url(#${fold})`} stroke="#583927" strokeWidth="3" />
      {!avatar && <path d="M128 274c28 11 57 10 83 9" fill="none" stroke="#d6a675" strokeOpacity=".42" strokeWidth="2" strokeLinecap="round" />}

      {/* A small Orion stitch is the only bright accent. */}
      <path d="M255 124c6 7 11 13 13 23" fill="none" stroke="#69c8d5" strokeWidth={avatar ? 5 : 3} strokeLinecap="round" />
      <path d="m260 124 5 3m-1 5 5 3" fill="none" stroke="#69c8d5" strokeWidth={avatar ? 3 : 2} strokeLinecap="round" />
    </svg>
  );
}
