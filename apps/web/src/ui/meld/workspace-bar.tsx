"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MeldMark } from "./meld-mark";
import { MeldWorkspaceMark } from "./workspace-mark";
import { PixelChevronDown, PixelPlus } from "@/ui/pixel-icons";
import styles from "./workspace-bar.module.css";

export type WorkspaceOption = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type MeldWorkspaceBarProps = {
  workspaceId: string;
  workspaceName: string;
  logoUrl: string | null;
  workspaces: WorkspaceOption[];
};

/**
 * The identity bar: the product mark, then the workspace you are in, then the
 * way out of it.
 *
 * The menu is a plain popover rather than a listbox: its items navigate, so
 * they are links, and a link inside a listbox lies to a screen reader about
 * what pressing it does.
 */
export function MeldWorkspaceBar({
  workspaceId,
  workspaceName,
  logoUrl,
  workspaces,
}: MeldWorkspaceBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismissal has to cover both exits, or the menu strands the keyboard user
  // who opened it and then changed their mind.
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={styles.bar} ref={containerRef}>
      {/* The clipped, elevated surface. The menu is deliberately NOT inside it:
          `clip-path` clips descendants too, so a popover nested in here is
          invisible outside the bar's own silhouette. */}
      <div className={styles.surface}>
        <Link
          className={styles.brand}
          href={`/${workspaceId}`}
          aria-label="Meld"
        >
          <MeldMark size={20} />
        </Link>

        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`${workspaceName} — switch or create workspace`}
          onClick={() => setIsOpen((current) => !current)}
        >
          <MeldWorkspaceMark name={workspaceName} logoUrl={logoUrl} />
          <span className={styles.name}>{workspaceName}</span>
          <span className={styles.chevron} data-open={isOpen} aria-hidden>
            <PixelChevronDown />
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuLabel}>SWITCH WORKSPACE</div>
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              role="menuitem"
              className={styles.item}
              href={`/${workspace.id}`}
              data-current={workspace.id === workspaceId}
              onClick={() => setIsOpen(false)}
            >
              <MeldWorkspaceMark
                name={workspace.name}
                logoUrl={workspace.logoUrl}
              />
              {workspace.name}
            </Link>
          ))}
          <Link
            role="menuitem"
            className={styles.item}
            href="/onboarding"
            onClick={() => setIsOpen(false)}
          >
            <span className={styles.itemIcon}>
              <PixelPlus aria-hidden />
            </span>
            Create workspace
          </Link>
        </div>
      ) : null}
    </div>
  );
}
