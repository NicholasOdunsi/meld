import { useId, type SVGProps } from "react";

export type OrionTalkingHatExpression = "neutral" | "curious" | "speaking";

export interface OrionTalkingHatProps extends SVGProps<SVGSVGElement> {
  expression?: OrionTalkingHatExpression;
  /** "avatar" drops the leather texture and fine creases so the face stays legible at small sizes. */
  appearance?: "illustration" | "avatar";
  decorative?: boolean;
}

/** Dark opening of the mouth for each expression. */
const MOUTH: Record<OrionTalkingHatExpression, string> = {
  neutral:
    "M136 298 C164 284 204 280 240 282 C262 284 280 288 294 294 L294 302 C270 296 242 294 210 296 C180 298 156 304 138 310Z",
  curious:
    "M176 292 C200 282 228 280 252 283 C268 285 282 289 292 295 L292 301 C276 297 256 296 236 297 C212 298 192 300 178 304Z",
  speaking:
    "M138 296 C168 280 210 276 244 278 C266 280 284 286 296 294 C290 308 268 318 232 319 C190 320 156 314 140 306Z",
};

/** Crisp seam line along the lips when the mouth is closed. */
const SEAM: Record<Exclude<OrionTalkingHatExpression, "speaking">, string> = {
  neutral: "M138 300 C168 286 206 282 240 284 C262 286 280 290 294 296",
  curious: "M178 296 C202 286 228 284 252 286 C268 288 282 292 292 297",
};

/**
 * Orion's mascot: a weathered leather talking hat whose face is formed by the folds of its crown.
 * Pure inline SVG; leather grain comes from SVG noise lit by a distant light.
 */
export function OrionTalkingHat({
  expression = "neutral",
  appearance = "illustration",
  decorative = false,
  width = 320,
  height = 320,
  ...props
}: OrionTalkingHatProps) {
  const id = useId().replace(/:/g, "");
  const i = (name: string) => `${id}-${name}`;
  const u = (name: string) => `url(#${i(name)})`;
  const avatar = appearance === "avatar";
  const curious = expression === "curious";
  const speaking = expression === "speaking";
  const texture = avatar ? undefined : u("leather");

  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 400"
      width={width}
      height={height}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : (props["aria-label"] ?? "Orion talking hat")}
      data-expression={expression}
      data-appearance={appearance}
    >
      <style>{`
        @keyframes orion-hat-speak-${id} {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(.55); }
        }
        [data-part="mouth"] { transform-box: fill-box; transform-origin: center top; }
        [data-expression="speaking"] [data-part="mouth"] {
          animation: orion-hat-speak-${id} 720ms ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-expression="speaking"] [data-part="mouth"] { animation: none; }
        }
      `}</style>
      <defs>
        {!avatar && (
        <filter data-part="grain" id={i("leather")} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="4" result="fine"/>
          <feTurbulence type="fractalNoise" baseFrequency=".03 .05" numOctaves="4" seed="11" result="mottle"/>
          <feComposite in="fine" in2="mottle" operator="arithmetic" k2=".5" k3=".5" result="bump"/>
          <feDiffuseLighting in="bump" surfaceScale="2" diffuseConstant="1.18" lightingColor="#fff4e6" result="lit">
            <feDistantLight azimuth="225" elevation="50"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="SourceGraphic" operator="arithmetic" k1="1" result="tex"/>
          <feComposite in="tex" in2="SourceAlpha" operator="in"/>
        </filter>
        )}
        <filter id={i("b2")} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
        <filter id={i("b4")} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
        <filter id={i("b8")} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
        <filter id={i("b14")} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>

        <linearGradient id={i("crownBase")} x1="0" y1="0" x2="1" y2=".25">
          <stop offset="0" stopColor="#a67c5e"/>
          <stop offset=".42" stopColor="#835c42"/>
          <stop offset=".8" stopColor="#583f2d"/>
          <stop offset="1" stopColor="#33271d"/>
        </linearGradient>
        <linearGradient id={i("brimTop")} x1="0" y1="0" x2="1" y2=".4">
          <stop offset="0" stopColor="#957259"/>
          <stop offset=".55" stopColor="#7c5e48"/>
          <stop offset="1" stopColor="#4a3a2e"/>
        </linearGradient>
        <linearGradient id={i("brimEdge")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3d2e23"/>
          <stop offset=".45" stopColor="#4a382b"/>
          <stop offset="1" stopColor="#1e150f"/>
        </linearGradient>
        <linearGradient id={i("band")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#33281f"/>
          <stop offset=".35" stopColor="#3e3128"/>
          <stop offset="1" stopColor="#140f0b"/>
        </linearGradient>

        <path id={i("crownShape")} d="M122 334
          C114 304 111 272 118 244  C125 216 140 198 146 172
          C151 150 148 128 156 108  C162 92 156 74 140 60
          C124 47 104 42 92 32      C84 24 91 13 108 12
          C140 11 176 24 198 44     C214 58 222 78 233 98
          C246 120 263 130 277 152  C294 178 302 212 304 248
          C306 282 300 308 296 334  C258 348 158 348 122 334Z"/>
        <clipPath id={i("crownClip")}><use href={`#${i("crownShape")}`}/></clipPath>
        <path id={i("brimShape")} d="M6 360 C24 334 84 314 148 307 C214 300 290 298 344 300 C362 299 376 292 388 290 C400 290 400 312 372 332 C336 352 264 366 196 370 C126 374 54 376 22 372 C6 370 0 366 6 360Z"/>
        <clipPath id={i("brimClip")}><use href={`#${i("brimShape")}`}/></clipPath>

      </defs>

      {/* ===== BRIM ===== */}
      <path d="M6 360 C0 366 6 370 22 372 C54 376 126 374 196 370 C264 366 336 352 372 332 C400 312 400 290 388 290 C404 296 402 322 380 340 C344 368 260 384 190 388 C120 392 46 388 18 380 C6 376 2 368 6 360Z" fill={u("brimEdge")}/>
      <g data-part="brim" filter={texture}><use href={`#${i("brimShape")}`} fill={u("brimTop")}/></g>
      <g clipPath={u("brimClip")}>
        <path d="M260 322 C306 310 350 302 398 290" stroke="#c9a789" strokeOpacity=".35" strokeWidth="12" fill="none" filter={u("b8")}/>
        <path d="M14 362 C70 344 130 338 180 340" stroke="#bf9d80" strokeOpacity=".3" strokeWidth="10" fill="none" filter={u("b8")}/>
        <path d="M60 368 C130 356 150 352 168 362" stroke="#1d150f" strokeOpacity=".35" strokeWidth="8" fill="none" filter={u("b4")}/>
        <path d="M40 376 C130 380 250 370 350 344" stroke="#160f0a" strokeOpacity=".55" strokeWidth="12" fill="none" filter={u("b4")}/>
        <ellipse cx="210" cy="338" rx="112" ry="20" fill="#0f0a07" opacity=".75" filter={u("b8")}/>
        <ellipse cx="248" cy="342" rx="116" ry="18" fill="#0f0a07" opacity=".45" filter={u("b14")}/>
      </g>
      <path d="M10 364 C60 376 160 374 240 364 C310 354 362 336 392 296" stroke="#cdab8e" strokeOpacity=".32" strokeWidth="1.5" fill="none"/>
      {!avatar && <path d="M318 352 l8 -9 l5 8 l7 -6" stroke="#20160f" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".65"/>}

      {/* ===== CROWN ===== */}
      <g data-part="crown" filter={texture}><use href={`#${i("crownShape")}`} fill={u("crownBase")}/></g>
      <g clipPath={u("crownClip")}>
        {/* form shading: crown turned slightly, light from upper left */}
        <path d="M296 120 C262 190 284 270 268 350 L340 350 L340 120Z" fill="#170f0a" opacity=".6" filter={u("b14")}/>
        <path d="M124 340 C114 280 122 220 146 176" stroke="#dcbc9c" strokeOpacity=".32" strokeWidth="12" fill="none" filter={u("b8")}/>
        <path d="M204 40 C226 66 236 92 260 126" stroke="#170f0a" strokeOpacity=".45" strokeWidth="18" fill="none" filter={u("b8")}/>

        {/* slumped tip: the cone folds over on itself */}
        <path d="M100 18 C138 18 172 30 194 50" stroke="#e2c6a6" strokeOpacity=".45" strokeWidth="10" fill="none" filter={u("b4")}/>
        <path d="M146 66 C170 80 196 92 226 92" stroke="#0e0906" strokeOpacity=".8" strokeWidth="12" fill="none" filter={u("b4")}/>
        <path d="M148 64 C172 77 198 88 224 88" stroke="#140d08" strokeWidth="2.2" fill="none" opacity=".85"/>
        <path d="M146 56 C170 68 196 78 220 79" stroke="#d6b595" strokeOpacity=".5" strokeWidth="6" fill="none" filter={u("b2")}/>

        {!avatar && (
        <>
        {/* diagonal compression creases down the cone */}
        <path d="M160 112 C182 120 208 120 236 130" stroke="#140d08" strokeOpacity=".6" strokeWidth="6" fill="none" filter={u("b2")}/>
        <path d="M160 106 C182 113 208 113 234 123" stroke="#d2af8e" strokeOpacity=".35" strokeWidth="4" fill="none" filter={u("b2")}/>
        <path d="M218 140 C236 146 256 158 268 172" stroke="#140d08" strokeOpacity=".5" strokeWidth="5" fill="none" filter={u("b2")}/>
        <path d="M152 150 C168 146 184 150 194 158" stroke="#140d08" strokeOpacity=".4" strokeWidth="4" fill="none" filter={u("b2")}/>

        </>
        )}

        {/* ===== FACE: folds of the crown, left of centre because the hat is turned a little ===== */}
        <g data-part="left-brow" transform={curious ? "translate(0 -9) rotate(-5 172 220)" : undefined}>
          <path d="M132 222 C136 198 162 186 190 190 C204 192 212 198 214 208 C200 204 182 204 164 210 C150 214 140 220 132 222Z" fill="#c4a283" opacity=".55" filter={u("b4")} />
          <path d="M140 210 C152 194 176 188 200 194" stroke="#ecd0b0" strokeOpacity=".55" strokeWidth="5" fill="none" strokeLinecap="round" filter={u("b2")} />
          <path d="M136 226 C156 212 186 210 210 218 C204 236 186 244 166 242 C150 240 140 234 136 226Z" fill="#1a0f09" opacity=".8" filter={u("b4")} />
        </g>
        {/* left lid: a closed slit, or a peering crease when curious */}
        <path
          d={
            curious
              ? "M150 228 C164 220 188 218 204 222 C194 236 166 238 150 228Z"
              : "M146 228 C164 236 186 236 204 224 C190 240 162 242 146 228Z"
          }
          fill="#050302"
          opacity={curious ? 0.85 : 0.95}
          filter={u("b2")}
        />
        <path d="M218 206 C226 192 252 188 274 196 C290 202 298 214 300 226 C286 214 266 208 246 208 C234 208 226 208 218 206Z" fill="#b39073" opacity=".45" filter={u("b4")} />
        <path d="M232 196 C252 190 274 196 290 210" stroke="#d9b898" strokeOpacity=".4" strokeWidth="5" fill="none" strokeLinecap="round" filter={u("b2")} />
        <path d="M222 220 C244 210 274 214 296 230 C286 244 266 248 246 244 C232 240 224 230 222 220Z" fill="#120a06" opacity=".85" filter={u("b4")} />
        <path d="M230 226 C248 236 272 236 288 230 C274 244 246 242 230 226Z" fill="#050302" opacity=".95" filter={u("b2")} />
        <path d="M152 244 C168 250 186 248 198 240" stroke="#d1ae8f" strokeOpacity=".4" strokeWidth="4" fill="none" strokeLinecap="round" filter={u("b2")} />
        <path d="M238 246 C254 252 270 250 282 242" stroke="#b8957a" strokeOpacity=".3" strokeWidth="4" fill="none" strokeLinecap="round" filter={u("b2")} />

        {/* nose: a rounded bulge where the leather is pinched */}
        <path d="M212 210 C206 228 200 248 204 262 C210 272 226 272 232 262 C236 246 226 226 212 210Z" fill="#c8a586" opacity=".5" filter={u("b4")} />
        <path d="M226 228 C234 244 236 258 230 266 C224 272 214 274 204 270" stroke="#100906" strokeOpacity=".55" strokeWidth="5" fill="none" strokeLinecap="round" filter={u("b4")} />
        <ellipse cx="212" cy="252" rx="6" ry="9" fill="#efd4b4" opacity=".35" filter={u("b2")} />

        {/* cheeks and laugh lines */}
        <ellipse cx="164" cy="264" rx="28" ry="16" fill="#be9c7e" opacity=".35" filter={u("b8")} />
        <ellipse cx="268" cy="264" rx="22" ry="13" fill="#a07e64" opacity=".22" filter={u("b8")} />
        <path d="M186 262 C176 272 166 280 150 286" stroke="#120b07" strokeOpacity=".4" strokeWidth="4" fill="none" strokeLinecap="round" filter={u("b2")} />
        <path d="M244 262 C256 270 268 278 282 284" stroke="#120b07" strokeOpacity=".35" strokeWidth="4" fill="none" strokeLinecap="round" filter={u("b2")} />

        {/* mouth: a lopsided seam in the leather; it opens when speaking */}
        <path data-part="mouth" d={MOUTH[expression]} fill="#070402" opacity=".92" filter={u("b2")} />
        {expression !== "speaking" && (
          <path d={SEAM[expression]} stroke="#040201" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        )}
        <path d={curious ? "M176 286 C200 276 228 274 250 277 C266 279 280 283 290 289" : "M142 290 C170 276 208 272 242 275 C262 277 280 282 292 288"} stroke="#dcbb9a" strokeOpacity=".45" strokeWidth="5" fill="none" filter={u("b2")} />
        <path d={speaking ? "M140 322 C172 314 214 314 252 318 C272 320 286 322 296 326" : "M140 314 C172 302 214 300 252 304 C272 306 286 310 296 314"} stroke="#c4a183" strokeOpacity=".45" strokeWidth="12" fill="none" filter={u("b4")} />
        <path d="M130 330 C176 320 240 318 300 326" stroke="#0e0906" strokeOpacity=".6" strokeWidth="8" fill="none" filter={u("b4")} />
        <path d="M128 304 C132 310 134 316 132 322" stroke="#140d08" strokeOpacity=".5" strokeWidth="4" fill="none" filter={u("b2")} />
      </g>

      {/* ===== BAND ===== */}
      <path d="M119 322 C164 338 256 338 299 322 L297 338 C258 352 158 352 122 338Z" fill={u("band")} />
      <path d="M121 324 C164 339 256 339 298 324" stroke="#6e5848" strokeOpacity=".5" strokeWidth="1.2" fill="none" />

      {/* ===== STITCHED REPAIR: the only Orion cyan ===== */}
      <path d="M252 150 C262 160 270 172 274 186" stroke="#140d08" strokeWidth="2" fill="none" opacity=".6" />
      <g stroke="#6fcbd6" strokeWidth={avatar ? 5 : 2.4} strokeLinecap="round">
        <path d="M250 156 l10 -3" />
        <path d="M256 164 l10 -3" />
        <path d="M262 173 l10 -3" />
        <path d="M266 182 l10 -3" />
      </g>

      <use href={`#${i("crownShape")}`} fill="none" stroke="#1c140e" strokeOpacity=".35" strokeWidth="1" />
    </svg>
  );
}
