import styles from "./workspace-mark.module.css";

export type MeldWorkspaceMarkProps = {
  name: string;
  logoUrl: string | null;
};

/**
 * A workspace's badge: its logo, or its initial on a coloured block.
 *
 * The fallback colour is derived from the name rather than stored, so two
 * workspaces stay visually distinct in the switcher without anyone having to
 * pick a colour when they create one.
 */
export function MeldWorkspaceMark({ name, logoUrl }: MeldWorkspaceMarkProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 6;
  }

  if (logoUrl) {
    // Arbitrary remote logos with no known intrinsic size, so not next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.mark} src={logoUrl} alt="" />;
  }

  return (
    <span className={styles.mark} data-tone={hash} aria-hidden>
      {initial}
    </span>
  );
}
