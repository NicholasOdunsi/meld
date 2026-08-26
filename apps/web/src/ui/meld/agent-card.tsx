import type { AgentKind } from "@meld/contracts";
import { MeldAgent, type MeldAgentSprite } from "@/ui/meld-agent";
import styles from "./agent-card.module.css";

export type MeldAgentCardProps = {
  kind: AgentKind;
  /** The lowercase handle, matching the row that opened this card. */
  handle: string;
  sprite: MeldAgentSprite;
  /** Two words, set in the pixel face. */
  ability: string;
  /** What the agent actually does. */
  abilityText: string;
  /** The agent in its own voice. */
  quote: string;
  isOpen: boolean;
  /** Which teammate row the card is standing beside, counted from the top. */
  offsetIndex: number;
  /** How many rows there are, so the nudge can be centred on the block. */
  rowCount: number;
};

/**
 * The one card the TEAMMATES block shares: the agent standing on a slab of its
 * own colour, what it can do, and one line in its own voice.
 *
 * There is exactly ONE of these for the whole block, not one per row. It
 * travels to whichever row you are on and swaps its pigment and its words --
 * the same container moving, rather than one card leaving while another
 * arrives. Three cards cross-fading in the same place read as a glitch.
 *
 * A display, not a menu -- `pointer-events: none` throughout, so it can never
 * swallow a click meant for the row underneath it. The row owns the state and
 * announces it with `aria-expanded`; this only paints.
 *
 * It positions itself against `.teammates` in `console-row.module.css`,
 * centred on the block and nudged one step per row -- never pinned to a row.
 * The card is taller than the whole block, so pinning it to the last row hung
 * it off the end of the page and gave the document a scrollbar.
 */
export function MeldAgentCard({
  kind,
  handle,
  sprite,
  ability,
  abilityText,
  quote,
  isOpen,
  offsetIndex,
  rowCount,
}: MeldAgentCardProps) {
  // Centred on the block: the middle row sits at 0, the rows either side are
  // nudged one step up or down. Stepping by the full row pitch instead is what
  // hung the card off the bottom of the page and gave the document a scrollbar.
  const nudge = offsetIndex - (rowCount - 1) / 2;
  return (
    <div
      className={styles.card}
      data-testid="agent-card"
      data-kind={kind}
      data-open={isOpen ? "true" : "false"}
      aria-hidden={!isOpen}
      // Set here rather than through a class: the step is a multiple of a
      // token, and a variable on the parent would restyle every child to move
      // one element.
      style={{
        transform: `translateY(calc(var(--meld-agent-card-step) * ${nudge}))`,
      }}
    >
      <div className={styles.flip}>
        {/* A border does not follow the pixel staircase, so the edge is a
         * filled, clipped frame layer holding a second clipped element --
         * the pattern COMPONENTS.md describes for MeldTextInput. */}
        <div className={styles.frame}>
          <div className={styles.inner}>
            <div className={styles.art}>
              <MeldAgent sprite={sprite} appearance="full" />
            </div>
            <div className={styles.handle}>{handle}</div>
            <div className={styles.ability}>{ability}</div>
            <p className={styles.text}>{abilityText}</p>
            <p className={styles.quote}>{quote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
