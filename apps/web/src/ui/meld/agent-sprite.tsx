import styles from "./agent-sprite.module.css";

export type MeldAgentState = "working" | "waiting" | "idle";

export type MeldAgentSpriteProps = {
  agent: "pm" | "design";
  state: MeldAgentState;
  /** Caption under the sprite, e.g. "DESIGN · DRAWING". */
  label: string;
};

/**
 * A teammate, standing on the ticket. The only thing on the deck that moves,
 * and it must never claim work that is not running -- `state` comes from
 * in-flight tasks, never from a guess.
 */
export function MeldAgentSprite({ agent, state, label }: MeldAgentSpriteProps) {
  return (
    <div
      className={styles.sprite}
      data-testid="agent-sprite"
      data-agent={agent}
      data-state={state}
    >
      {state === "working" ? (
        <div className={styles.meter} data-testid="agent-meter" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}
      <svg className={styles.body} viewBox="0 0 32 34" role="presentation">
        <rect className={styles.torso} x="6" y="15" width="14" height="17" />
        <rect className={styles.head} x="6" y="3" width="14" height="13" />
        <rect className={styles.eye} x="9" y="8" width="3" height="3" />
        <rect className={styles.eye} x="15" y="8" width="3" height="3" />
        {agent === "design" ? (
          <g className={styles.brush}>
            <rect className={styles.handle} x="19" y="18" width="9" height="3" />
            <rect className={styles.bristle} x="27" y="17" width="3" height="5" />
          </g>
        ) : null}
      </svg>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
