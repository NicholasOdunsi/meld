import type { ReactNode } from "react";
import type { MeldTileColor } from "./peek-card";
import styles from "./project-tile.module.css";

export type MeldProjectTileProps = {
  name: string;
  color: MeldTileColor;
  roomCount: number;
  /** Relative time, already formatted, e.g. "2h". */
  updatedLabel: string;
  /** An agent is working in this project right now. */
  isLive?: boolean;
  unreadCount?: number;
  /** A `MeldPeekCard`. */
  peek?: ReactNode;
};

/**
 * A project as a container with its contents spilling out, not an icon. The
 * colour is a glow rather than a fill, so a row of tiles reads as one family
 * instead of a paint chart.
 */
export function MeldProjectTile({
  name,
  color,
  roomCount,
  updatedLabel,
  isLive = false,
  unreadCount = 0,
  peek,
}: MeldProjectTileProps) {
  const rooms = roomCount === 1 ? "1 room" : `${roomCount} rooms`;

  return (
    <div className={styles.wrap} data-color={color}>
      {peek}
      <div className={styles.tile}>
        <div className={styles.glow} aria-hidden />
        {isLive ? <span className={styles.live}>LIVE</span> : null}
        {unreadCount > 0 ? (
          <span className={styles.unread} data-testid="tile-unread">
            {unreadCount}
          </span>
        ) : null}
        <div className={styles.name}>{name}</div>
        <div className={styles.count}>{`${rooms} · ${updatedLabel}`}</div>
      </div>
    </div>
  );
}
