import type { ReactNode } from "react";
import type { MeldTileColor } from "./peek-card";
import styles from "./project-tile.module.css";

export type MeldProjectTileProps = {
  name: string;
  color: MeldTileColor;
  roomCount: number;
  /** Relative time, already formatted, e.g. "2h". Null prints no age at all. */
  updatedLabel: string | null;
  /** An agent is working in this project right now. */
  isLive?: boolean;
  unreadCount?: number;
  /** A `MeldPeekCard`. */
  peek?: ReactNode;
};

/**
 * A project as a folder holding its contents: a rounded black square with the
 * top of its most recent work showing above a front pocket.
 *
 * The three layers are the whole point, and the order matters -- back panel,
 * then the cards, then a pocket in front of them carrying the title. Cards
 * sitting *on top* of the tile read as paper dropped onto a box; cards tucked
 * *into* a pocket read as a folder with something in it. Everything is clipped
 * to the tile's silhouette, so nothing hangs off the edge.
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
      <div className={styles.tile}>
        {isLive ? (
          <span className={styles.live} data-testid="tile-live">
            LIVE
          </span>
        ) : null}
        {unreadCount > 0 ? (
          <span className={styles.unread} data-testid="tile-unread">
            {unreadCount}
          </span>
        ) : null}
        <div className={styles.stack}>{peek}</div>
        <div className={styles.pocket} aria-hidden />
        <div className={styles.meta}>
          <div className={styles.name}>{name}</div>
          <div className={styles.count}>
            <span className={styles.swatch} aria-hidden />
            {updatedLabel === null ? rooms : `${rooms} · ${updatedLabel}`}
          </div>
        </div>
      </div>
    </div>
  );
}
