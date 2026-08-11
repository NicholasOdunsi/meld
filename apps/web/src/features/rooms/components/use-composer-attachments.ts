"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomAttachmentView } from "../attachment-types";
import {
  isReadyComposerAttachment,
  type QueuedRoomAttachment,
  type ReadyRoomComposerAttachment,
  type StagedComposerAttachment,
  validateQueuedFiles,
} from "./composer-model";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

function releasePreviews(
  attachments: readonly QueuedRoomAttachment[],
) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

// The composer's attachment queue: validation, upload lifecycle, discard,
// and the reservation that keeps an in-flight send's files out of the queue
// without losing them if the send fails.
//
// State is mirrored into a ref because uploads settle asynchronously and
// several callbacks need the latest queue without re-subscribing.
export function useComposerAttachments({
  onStageAttachment,
  onDiscardStagedAttachment,
}: {
  onStageAttachment?: (
    attachment: QueuedRoomAttachment,
  ) => Promise<RoomAttachmentView>;
  onDiscardStagedAttachment?: (attachmentId: string) => Promise<void>;
}) {
  const [items, setItems] = useState<StagedComposerAttachment[]>([]);
  const [error, setError] = useState<string>();
  const itemsRef = useRef<StagedComposerAttachment[]>([]);
  const reservedRef = useRef(
    new Map<string, ReadyRoomComposerAttachment>(),
  );

  useEffect(
    () => () => {
      releasePreviews([
        ...itemsRef.current,
        ...reservedRef.current.values(),
      ]);
      itemsRef.current = [];
      reservedRef.current.clear();
    },
    [],
  );

  const commit = useCallback((next: StagedComposerAttachment[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const updateAttachment = useCallback(
    (
      id: string,
      update: (
        attachment: StagedComposerAttachment,
      ) => StagedComposerAttachment,
    ) => {
      const index = itemsRef.current.findIndex(
        (attachment) => attachment.id === id,
      );
      if (index === -1) {
        return false;
      }
      const next = [...itemsRef.current];
      next[index] = update(next[index]);
      commit(next);
      return true;
    },
    [commit],
  );

  const queueFiles = useCallback(
    (files: File[]) => {
      const outstandingAttachments = [
        ...itemsRef.current,
        ...reservedRef.current.values(),
      ];
      const result = validateQueuedFiles(outstandingAttachments, files);
      if (result.accepted.length > 0) {
        const uploading: StagedComposerAttachment[] =
          result.accepted.map((attachment) => ({
            ...attachment,
            status: "uploading",
          }));
        commit([...itemsRef.current, ...uploading]);

        for (const attachment of result.accepted) {
          if (!onStageAttachment) {
            updateAttachment(attachment.id, (current) => ({
              id: current.id,
              file: current.file,
              previewUrl: current.previewUrl,
              status: "failed",
              error: "Upload unavailable",
            }));
            continue;
          }
          try {
            void onStageAttachment(attachment).then(
              (uploaded) => {
                updateAttachment(attachment.id, (current) => ({
                  id: current.id,
                  file: current.file,
                  previewUrl: current.previewUrl,
                  status: "uploaded",
                  uploaded,
                }));
              },
              (error: unknown) => {
                updateAttachment(attachment.id, (current) => ({
                  id: current.id,
                  file: current.file,
                  previewUrl: current.previewUrl,
                  status: "failed",
                  error: errorMessage(error, "Upload failed"),
                }));
              },
            );
          } catch (error) {
            updateAttachment(attachment.id, (current) => ({
              id: current.id,
              file: current.file,
              previewUrl: current.previewUrl,
              status: "failed",
              error: errorMessage(error, "Upload failed"),
            }));
          }
        }
      }
      setError(
        result.errors.length > 0
          ? result.errors.join(" ")
          : undefined,
      );
    },
    [commit, onStageAttachment, updateAttachment],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      const removed = itemsRef.current.find(
        (attachment) => attachment.id === id,
      );
      if (!removed || removed.status === "discarding") {
        return;
      }

      if (removed.status === "uploaded") {
        if (!onDiscardStagedAttachment) {
          setError(`${removed.file.name}: Discard unavailable`);
          return;
        }
        const uploaded = removed.uploaded;
        updateAttachment(id, (current) => ({
          id: current.id,
          file: current.file,
          previewUrl: current.previewUrl,
          status: "discarding",
          uploaded,
        }));
        try {
          await onDiscardStagedAttachment(uploaded.id);
        } catch (error) {
          updateAttachment(id, (current) => ({
            id: current.id,
            file: current.file,
            previewUrl: current.previewUrl,
            status: "uploaded",
            uploaded,
          }));
          setError(
            `${removed.file.name}: ${errorMessage(
              error,
              "Discard failed",
            )}`,
          );
          return;
        }
      }

      const stillQueued = itemsRef.current.find(
        (attachment) => attachment.id === id,
      );
      if (!stillQueued) {
        return;
      }
      releasePreviews([stillQueued]);
      commit(
        itemsRef.current.filter((attachment) => attachment.id !== id),
      );
      setError(undefined);
    },
    [commit, onDiscardStagedAttachment, updateAttachment],
  );

  // Reads the ref, not render state: callers check this from event handlers
  // that may run before a re-render has landed.
  const areAllReady = useCallback(
    () => itemsRef.current.every(isReadyComposerAttachment),
    [],
  );

  // Moves the queue into the reservation so a second send cannot pick the
  // same files up, and returns what was reserved.
  const beginSubmission = useCallback(() => {
    const submitted = itemsRef.current.filter(
      isReadyComposerAttachment,
    );
    for (const attachment of submitted) {
      reservedRef.current.set(attachment.id, attachment);
    }
    commit([]);
    return submitted;
  }, [commit]);

  const releaseReservation = useCallback(
    (reserved: readonly ReadyRoomComposerAttachment[]) =>
      reserved.filter((attachment) =>
        reservedRef.current.delete(attachment.id),
      ),
    [],
  );

  const completeSubmission = useCallback(
    (reserved: readonly ReadyRoomComposerAttachment[]) => {
      releasePreviews(releaseReservation(reserved));
      setError(undefined);
    },
    [releaseReservation],
  );

  // Send failed: put the reserved files back at the front of the queue,
  // skipping any the user has re-added in the meantime.
  const cancelSubmission = useCallback(
    (reserved: readonly ReadyRoomComposerAttachment[]) => {
      const released = releaseReservation(reserved);
      if (released.length === 0) {
        return;
      }
      const queuedIds = new Set(
        itemsRef.current.map(({ id }) => id),
      );
      commit([
        ...released.filter(({ id }) => !queuedIds.has(id)),
        ...itemsRef.current,
      ]);
    },
    [commit, releaseReservation],
  );

  return {
    items,
    error,
    queueFiles,
    removeAttachment,
    areAllReady,
    beginSubmission,
    completeSubmission,
    cancelSubmission,
  };
}
