import type postgres from "postgres";

export interface CanvasAuthorityLease {
  readonly key: string;
  release(): Promise<void>;
}

export interface CanvasAuthorityLeaseFactory {
  acquire(
    organizationId: string,
    roomId: string,
  ): Promise<CanvasAuthorityLease | null>;
}

type ReservedSql = Awaited<ReturnType<postgres.Sql["reserve"]>>;

function authorityKey(organizationId: string, roomId: string): string {
  return `${organizationId}:${roomId}`;
}

/**
 * Holds a PostgreSQL session advisory lock for as long as a canvas room is
 * owned by this gateway process. The reserved connection is deliberately kept
 * open: advisory locks belong to the database session, not the query.
 */
export function createCanvasAuthorityLeaseFactory(
  sql: postgres.Sql,
): CanvasAuthorityLeaseFactory {
  return {
    async acquire(organizationId, roomId) {
      const key = authorityKey(organizationId, roomId);
      let reserved: ReservedSql | undefined;

      try {
        reserved = await sql.reserve();
        const rows = await reserved<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_lock(
            hashtextextended(${key}, 0)
          ) AS acquired
        `;
        if (!rows[0]?.acquired) {
          reserved.release();
          return null;
        }

        let released = false;
        return {
          key,
          async release() {
            if (released) return;
            released = true;
            try {
              await reserved!`
                SELECT pg_advisory_unlock(
                  hashtextextended(${key}, 0)
                ) AS released
              `;
            } finally {
              reserved!.release();
            }
          },
        } satisfies CanvasAuthorityLease;
      } catch (error) {
        reserved?.release();
        throw error;
      }
    },
  };
}

export function canvasAuthorityKey(
  organizationId: string,
  roomId: string,
): string {
  return authorityKey(organizationId, roomId);
}
