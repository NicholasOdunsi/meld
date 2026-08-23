"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  FreeformDocumentSchema,
  type FreeformDocument,
  type FreeformNode,
  type StoredPRDDocument,
} from "@meld/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptPrdVersion,
  autosavePrdDocument,
  type AutosavePrdResult,
} from "../actions";
import { documentToMarkdown } from "../document-markdown";
import {
  createEmptyFreeformDocument,
  hasMeaningfulDocumentContent,
  normalizePrdDocument,
} from "../freeform-document";
import { prdDocumentFileName } from "../prd-markdown";
import type { RoomPrd } from "../schemas";
import { DocumentHeader, type DocumentSaveState } from "./document-header";
import { FreeformDocumentEditor } from "./freeform-document-editor";
import { PrdOutlineRail, type OutlineRailItem } from "./prd-outline-rail";

const AUTOSAVE_DELAY_MS = 750;

function isNewerRevision(incoming: RoomPrd, current: RoomPrd): boolean {
  return incoming.version > current.version ||
    (incoming.version === current.version && incoming.updatedAt > current.updatedAt);
}

function nodeText(node: FreeformNode): string {
  return node.type === "text"
    ? node.text ?? ""
    : (node.content ?? []).map(nodeText).join("");
}

function outlineFromDocument(document: FreeformDocument): OutlineRailItem[] {
  return (document.body.content ?? [])
    .filter(
      (node) =>
        node.type === "heading" && typeof node.attrs?.meldId === "string",
    )
    .map((node) => ({
      id: node.attrs?.meldId as string,
      label: nodeText(node).trim() || "Untitled section",
    }));
}

export function FreeformDocumentSurface({
  roomId,
  basePath,
  prd: initialPrd,
  ownerName,
  canEdit,
  canAccept,
}: {
  roomId: string;
  basePath?: string;
  prd: RoomPrd | null;
  ownerName: string;
  canEdit: boolean;
  canAccept: boolean;
}) {
  const [prd, setPrd] = useState(initialPrd);
  const [document, setDocument] = useState<FreeformDocument>(() =>
    initialPrd
      ? normalizePrdDocument(
          initialPrd.document as StoredPRDDocument,
          basePath ? `${basePath}?tab=canvas` : undefined,
        )
      : createEmptyFreeformDocument(),
  );
  const [saveState, setSaveState] = useState<DocumentSaveState>("idle");
  const [isAccepting, setIsAccepting] = useState(false);
  const [isEditing, setIsEditing] = useState(
    () => !initialPrd || initialPrd.status !== "accepted",
  );
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<FreeformDocument | null>(null);
  const latestDocumentRef = useRef(document);
  const revisionRef = useRef<RoomPrd | null>(initialPrd);
  const conflictRevisionRef = useRef<RoomPrd | null>(null);
  const pausedRef = useRef(false);

  const runSave = useCallback(async () => {
    if (inFlightRef.current || pausedRef.current) return;
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    inFlightRef.current = true;
    setSaveState("saving");
    const revision = revisionRef.current;
    let result: AutosavePrdResult;
    try {
      result = await autosavePrdDocument({
        roomId,
        basePrdId: revision?.id ?? null,
        baseVersion: revision?.version ?? 0,
        baseUpdatedAt: revision?.updatedAt ?? null,
        document: next,
      });
    } catch {
      result = { status: "error", message: "Could not save the document." };
    }
    inFlightRef.current = false;
    if (result.status === "saved") {
      revisionRef.current = result.prd;
      setPrd(result.prd);
      setSaveState("saved");
      if (pendingRef.current) void runSave();
      return;
    }
    if (result.status === "conflict") {
      pausedRef.current = true;
      conflictRevisionRef.current = result.latest;
      pendingRef.current = latestDocumentRef.current;
      setSaveState("conflict");
      return;
    }
    pendingRef.current = latestDocumentRef.current;
    setSaveState("error");
  }, [roomId]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!initialPrd) return;
    const current = revisionRef.current;
    if (current && !isNewerRevision(initialPrd, current)) return;

    if (pendingRef.current || inFlightRef.current) {
      pausedRef.current = true;
      conflictRevisionRef.current = initialPrd;
      setSaveState("conflict");
      return;
    }

    const nextDocument = normalizePrdDocument(
      initialPrd.document as StoredPRDDocument,
      basePath ? `${basePath}?tab=canvas` : undefined,
    );
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    revisionRef.current = initialPrd;
    latestDocumentRef.current = nextDocument;
    conflictRevisionRef.current = null;
    pausedRef.current = false;
    setPrd(initialPrd);
    setDocument(nextDocument);
    setSaveState("idle");
    setIsEditing(initialPrd.status !== "accepted");
  }, [basePath, initialPrd]);

  function handleChange(next: FreeformDocument) {
    const parsed = FreeformDocumentSchema.safeParse(next);
    if (!parsed.success) return;
    latestDocumentRef.current = parsed.data;
    setDocument(parsed.data);
    if (!hasMeaningfulDocumentContent(parsed.data) && !revisionRef.current) return;
    pendingRef.current = parsed.data;
    setSaveState("idle");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSave(), AUTOSAVE_DELAY_MS);
  }

  async function handleAccept() {
    if (!prd || isAccepting) return;
    setIsAccepting(true);
    const result = await acceptPrdVersion({ roomId, prdId: prd.id });
    if (result.status === "accepted") {
      revisionRef.current = result.prd;
      setPrd(result.prd);
      setIsEditing(false);
    }
    setIsAccepting(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(documentToMarkdown(document));
  }

  function handleExport() {
    const blob = new Blob([documentToMarkdown(document)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = prdDocumentFileName(document.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  function retry() {
    pausedRef.current = false;
    pendingRef.current = latestDocumentRef.current;
    void runSave();
  }

  function keepLocalCopy() {
    const latest = conflictRevisionRef.current;
    if (!latest) return;
    if (!window.confirm("Replace the latest saved document with your local copy?")) {
      return;
    }
    revisionRef.current = latest;
    conflictRevisionRef.current = null;
    retry();
  }

  const outlineItems = outlineFromDocument(document);

  return (
    <VStack
      width="100%"
      height="100%"
      align="center"
      isScrollable
      data-testid="freeform-document-surface"
      style={{
        padding: "var(--spacing-6)",
        // The composer floats over this, so the document has to end above it
        // rather than behind it -- see --meld-dock-clearance.
        paddingBottom: "var(--meld-dock-clearance)",
      }}
    >
      {/* The positioning context PrdOutlineRail anchors to. Without it the
          rail resolves against some ancestor further up and drifts away from
          the document when its pane is moved. */}
      <HStack
        width="100%"
        vAlign="start"
        justify="center"
        style={{ position: "relative" }}
      >
        {/* Auto side-margins centre the reading column by absorbing the row's
            free space themselves. That is also what carries the outline rail
            out to the right edge -- doing it with an auto margin on the rail
            instead takes the space from one side only and pins the document
            against the left edge. */}
        <VStack
          gap={6}
          width="100%"
          maxWidth="calc(var(--spacing-12) * 15)"
          style={{ marginInline: "auto" }}
        >
          <DocumentHeader
            prd={prd}
            ownerName={ownerName}
            saveState={saveState}
            canEdit={canEdit}
            canAccept={canAccept}
            isAccepting={isAccepting}
            onAccept={() => void handleAccept()}
            onCopy={() => void handleCopy()}
            onExport={handleExport}
            isEditing={isEditing}
            onEdit={() => setIsEditing(true)}
          />
          {saveState === "error" ? (
            <Banner
              status="error"
              title="Could not save your changes"
              endContent={<Button label="Retry" size="sm" onClick={retry} />}
            />
          ) : null}
          {saveState === "conflict" ? (
            <Banner
              status="warning"
              title="This document changed in another window"
              description="Your local copy is still here. Reload to see the latest saved version."
              endContent={
                <HStack gap={2} wrap="wrap">
                  <Button
                    label="Load latest"
                    size="sm"
                    onClick={() => window.location.reload()}
                  />
                  <Button
                    label="Keep my copy"
                    size="sm"
                    variant="ghost"
                    onClick={keepLocalCopy}
                  />
                </HStack>
              }
            />
          ) : null}
          {!canEdit ? (
            <Text color="secondary">This document is read-only.</Text>
          ) : !isEditing ? (
            <Text color="secondary">Click Edit to make changes.</Text>
          ) : null}
          <FreeformDocumentEditor
            document={document}
            canEdit={canEdit && isEditing}
            canvasHref={basePath ? `${basePath}?tab=canvas` : undefined}
            onChange={canEdit && isEditing ? handleChange : undefined}
          />
        </VStack>
        {outlineItems.length > 0 ? <PrdOutlineRail items={outlineItems} /> : null}
      </HStack>
    </VStack>
  );
}
