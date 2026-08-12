"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ChevronDown } from "@boxicons/react/ChevronDown";
import { ChevronUp } from "@boxicons/react/ChevronUp";
import { Plus } from "@boxicons/react/Plus";
import { X } from "@boxicons/react/X";
import type { PRDDocument } from "@meld/contracts";
import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { savePrdVersion } from "../actions";
import {
  PRD_SECTIONS,
  emptySectionValue,
  isSectionEmpty,
  type PrdSection,
} from "../prd-sections";
import type { RoomPrd } from "../schemas";
import { layoutFlowPreview } from "../flow-preview-layout";
import { DocInput, DocTextArea } from "./prd-doc-inputs";
import { EditableSection } from "./prd-editable-section";
import { EditableStringList } from "./prd-editable-list";
import { FlowPreviewDiagram } from "./flow-preview";

function cloneDocument(document: PRDDocument): PRDDocument {
  return structuredClone(document);
}

function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

// Small, dimmed-until-hover icon controls used on compound rows (risks,
// decisions) that need more than one field and so don't fit the
// EditableStringList bullet pattern.
function RowControls({
  rowLabel,
  index,
  count,
  isDisabled,
  onMove,
  onRemove,
}: {
  rowLabel: string;
  index: number;
  count: number;
  isDisabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <HStack gap={0} style={{ opacity: 0.5 }}>
      <Button
        label={`Move ${rowLabel} ${index + 1} up`}
        icon={<ChevronUp pack="basic" size="sm" />}
        size="sm"
        variant="ghost"
        isIconOnly
        isDisabled={isDisabled || index === 0}
        onClick={() => onMove(-1)}
      />
      <Button
        label={`Move ${rowLabel} ${index + 1} down`}
        icon={<ChevronDown pack="basic" size="sm" />}
        size="sm"
        variant="ghost"
        isIconOnly
        isDisabled={isDisabled || index === count - 1}
        onClick={() => onMove(1)}
      />
      <Button
        label={`Remove ${rowLabel} ${index + 1}`}
        icon={<X pack="basic" size="sm" />}
        size="sm"
        variant="ghost"
        isIconOnly
        isDisabled={isDisabled}
        onClick={onRemove}
      />
    </HStack>
  );
}

// Also rendered by PrdDocument, in the persistent top-right actions bar --
// PrdEditor drives it there through the imperative handle below so Cancel /
// Save changes stay put instead of jumping down to wherever the editor body
// happens to start.
export function EditorActions({
  isDisabled,
  isDirty,
  isSaving,
  onCancel,
  onSave,
}: {
  isDisabled: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <HStack gap={2} wrap="wrap">
      <Button
        label="Cancel"
        variant="secondary"
        isDisabled={isSaving}
        onClick={onCancel}
      />
      <Button
        label="Save changes"
        variant="primary"
        isDisabled={isDisabled || !isDirty}
        isLoading={isSaving}
        onClick={onSave}
      />
    </HStack>
  );
}

// The value a just-restored section should seed itself with so there's
// something to click into, rather than reappearing as a dead end with an
// "Add row" button and nothing above it.
function seededValue(section: PrdSection): PRDDocument[keyof PRDDocument] {
  switch (section.kind) {
    case "prose":
      return "";
    case "list":
      return [""];
    case "mvp":
      return { included: [""], excluded: [] };
    case "risks":
      return [{ risk: "", mitigation: "" }];
    case "decisions":
      return [{ decision: "", rationale: "", sourceMessageIds: [] }];
    case "flow":
      // A restored journeys section seeds an editable prose box; an actual flow
      // is authored on the User Flows canvas and shown read-only when present.
      return "";
  }
}

// Imperative handle so PrdDocument's persistent top-right actions bar can
// trigger Cancel / Save changes without owning the draft state that lives
// here (dirty-tracking, section collapse, save/conflict handling).
export type PrdEditorHandle = {
  save: () => void;
  cancel: () => void;
};

export function PrdEditor({
  initialPrd,
  canEdit,
  onSaved,
  onCancel,
  onDirtyChange,
  onSavingChange,
  onReviewLatest,
  ref,
}: {
  initialPrd: RoomPrd;
  canEdit: boolean;
  onSaved: (prd: RoomPrd) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSavingChange?: (isSaving: boolean) => void;
  onReviewLatest?: () => void;
  ref?: Ref<PrdEditorHandle>;
}) {
  const [draft, setDraft] = useState(() => cloneDocument(initialPrd.document));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [justRestoredId, setJustRestoredId] = useState<string | null>(null);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialPrd.document),
    [draft, initialPrd.document],
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  function resetDraft() {
    setDraft(cloneDocument(initialPrd.document));
    setCollapsedSections(new Set());
    setJustRestoredId(null);
    setSaveError(null);
    setConflictVersion(null);
  }

  function handleCancel() {
    resetDraft();
    onCancel();
  }

  function handleDeleteSection(section: PrdSection) {
    setDraft((current) => ({
      ...current,
      [section.field]: emptySectionValue(section.kind),
    }));
    setCollapsedSections((current) => {
      const next = new Set(current);
      next.add(section.id);
      return next;
    });
  }

  function handleRestoreSection(section: PrdSection) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      next.delete(section.id);
      return next;
    });
    setJustRestoredId(section.id);
    setDraft((current) => {
      const value = current[section.field];
      if (!isSectionEmpty(section.kind, value)) return current;
      return { ...current, [section.field]: seededValue(section) };
    });
  }

  async function handleSave() {
    if (!canEdit || !isDirty || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setConflictVersion(null);
    try {
      const result = await savePrdVersion({
        roomId: initialPrd.roomId,
        baseVersion: initialPrd.version,
        document: draft,
      });
      if (result.status === "saved") {
        setDraft(cloneDocument(result.prd.document));
        onSaved(result.prd);
        onCancel();
        return;
      }
      if (result.status === "conflict") {
        setConflictVersion(result.currentVersion);
        return;
      }
      setSaveError(result.message);
    } catch {
      setSaveError("Could not save the PRD version.");
    } finally {
      setIsSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: handleCancel,
  }));

  const controlsDisabled = !canEdit || isSaving;

  return (
    <VStack gap={6} width="100%">
      {saveError ? <Text color="secondary">{saveError}</Text> : null}
      {conflictVersion !== null ? (
        <VStack gap={2}>
          <Text color="secondary">
            A newer version (v{conflictVersion}) is available.
          </Text>
          <Button
            label="Review latest"
            variant="secondary"
            onClick={onReviewLatest}
          />
        </VStack>
      ) : null}
      <VStack gap={5} width="100%">
        <DocInput
          ariaLabel="Title"
          variant="title"
          value={draft.title}
          onChange={(title) => setDraft((current) => ({ ...current, title }))}
          isDisabled={controlsDisabled}
          placeholder="Untitled PRD"
        />
        {PRD_SECTIONS.map((section) => {
          const value = draft[section.field];
          const isCollapsed = collapsedSections.has(section.id);
          const isJustRestored = justRestoredId === section.id;

          return (
            // The outline rail scrolls to these ids, so each section needs its
            // own anchor element around the editable body.
            <VStack key={section.id} id={section.id} width="100%">
              <EditableSection
                label={section.label}
                isCollapsed={isCollapsed}
                isDisabled={controlsDisabled}
                onDelete={() => handleDeleteSection(section)}
                onRestore={() => handleRestoreSection(section)}
              >
                {section.kind === "prose" ? (
                  <DocTextArea
                    ariaLabel={section.label}
                    value={value as string}
                    placeholder={`Write the ${section.label.toLowerCase()}…`}
                    onChange={(nextValue) =>
                      setDraft((current) => ({
                        ...current,
                        [section.field]: nextValue,
                      }))
                    }
                    isDisabled={controlsDisabled}
                    hasAutoFocus={isJustRestored}
                  />
                ) : null}

                {section.kind === "list" ? (
                  <EditableStringList
                    sectionLabel={section.label}
                    rows={value as string[]}
                    onChange={(rows) =>
                      setDraft((current) => ({
                        ...current,
                        [section.field]: rows,
                      }))
                    }
                    isDisabled={controlsDisabled}
                    autoFocusFirstRow={isJustRestored}
                  />
                ) : null}

                {section.kind === "mvp"
                  ? (() => {
                      const scope = value as PRDDocument["mvpScope"];
                      return (
                        <VStack gap={4} width="100%">
                          {(["included", "excluded"] as const).map((name) => (
                            <EditableSection
                              key={name}
                              label={name === "included" ? "Included" : "Excluded"}
                              isCollapsed={scope[name].length === 0}
                              isDisabled={controlsDisabled}
                              onDelete={() =>
                                setDraft((current) => ({
                                  ...current,
                                  mvpScope: {
                                    ...current.mvpScope,
                                    [name]: [],
                                  },
                                }))
                              }
                              onRestore={() =>
                                setDraft((current) => ({
                                  ...current,
                                  mvpScope: {
                                    ...current.mvpScope,
                                    [name]: [""],
                                  },
                                }))
                              }
                            >
                              <EditableStringList
                                sectionLabel={
                                  name === "included"
                                    ? "Included MVP"
                                    : "Excluded MVP"
                                }
                                rows={scope[name]}
                                onChange={(rows) =>
                                  setDraft((current) => ({
                                    ...current,
                                    mvpScope: {
                                      ...current.mvpScope,
                                      [name]: rows,
                                    },
                                  }))
                                }
                                isDisabled={controlsDisabled}
                                autoFocusFirstRow={
                                  isJustRestored && name === "included"
                                }
                              />
                            </EditableSection>
                          ))}
                        </VStack>
                      );
                    })()
                  : null}

                {section.kind === "risks"
                  ? (() => {
                      const rows = value as PRDDocument["risksAndMitigations"];
                      return (
                        <VStack gap={3} width="100%">
                          {rows.map((row, index) => (
                            <HStack key={index} gap={2} vAlign="start" width="100%">
                              <VStack gap={1} width="100%" style={{ flex: 1 }}>
                                <DocInput
                                  ariaLabel={`Risk row ${index + 1}`}
                                  value={row.risk}
                                  onChange={(risk) =>
                                    setDraft((current) => ({
                                      ...current,
                                      risksAndMitigations:
                                        current.risksAndMitigations.map(
                                          (item, i) =>
                                            i === index ? { ...item, risk } : item,
                                        ),
                                    }))
                                  }
                                  isDisabled={controlsDisabled}
                                  hasAutoFocus={isJustRestored && index === 0}
                                  placeholder="Risk"
                                />
                                <DocTextArea
                                  ariaLabel={`Mitigation row ${index + 1}`}
                                  value={row.mitigation}
                                  onChange={(mitigation) =>
                                    setDraft((current) => ({
                                      ...current,
                                      risksAndMitigations:
                                        current.risksAndMitigations.map(
                                          (item, i) =>
                                            i === index
                                              ? { ...item, mitigation }
                                              : item,
                                        ),
                                    }))
                                  }
                                  isDisabled={controlsDisabled}
                                  placeholder="Mitigation"
                                />
                              </VStack>
                              <RowControls
                                rowLabel="risk row"
                                index={index}
                                count={rows.length}
                                isDisabled={controlsDisabled}
                                onMove={(direction) =>
                                  setDraft((current) => ({
                                    ...current,
                                    risksAndMitigations: moveRow(
                                      current.risksAndMitigations,
                                      index,
                                      direction,
                                    ),
                                  }))
                                }
                                onRemove={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    risksAndMitigations:
                                      current.risksAndMitigations.filter(
                                        (_, i) => i !== index,
                                      ),
                                  }))
                                }
                              />
                            </HStack>
                          ))}
                          <Button
                            label="Add risk row"
                            icon={<Plus pack="basic" size="sm" />}
                            variant="ghost"
                            size="sm"
                            isDisabled={controlsDisabled}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                risksAndMitigations: [
                                  ...current.risksAndMitigations,
                                  { risk: "", mitigation: "" },
                                ],
                              }))
                            }
                          />
                        </VStack>
                      );
                    })()
                  : null}

                {section.kind === "decisions"
                  ? (() => {
                      const rows = value as PRDDocument["decisionHistory"];
                      return (
                        <VStack gap={4} width="100%">
                          {rows.map((row, index) => (
                            <VStack
                              key={index}
                              gap={2}
                              width="100%"
                              style={{
                                paddingBottom: "var(--spacing-3)",
                                borderBottom:
                                  index < rows.length - 1
                                    ? "1px solid var(--color-border)"
                                    : undefined,
                              }}
                            >
                              <HStack gap={2} vAlign="start" width="100%">
                                <VStack gap={1} width="100%" style={{ flex: 1 }}>
                                  <DocInput
                                    ariaLabel={`Decision row ${index + 1}`}
                                    value={row.decision}
                                    onChange={(decision) =>
                                      setDraft((current) => ({
                                        ...current,
                                        decisionHistory:
                                          current.decisionHistory.map((item, i) =>
                                            i === index
                                              ? { ...item, decision }
                                              : item,
                                          ),
                                      }))
                                    }
                                    isDisabled={controlsDisabled}
                                    hasAutoFocus={isJustRestored && index === 0}
                                    placeholder="Decision"
                                  />
                                  <DocTextArea
                                    ariaLabel={`Decision rationale row ${index + 1}`}
                                    value={row.rationale}
                                    onChange={(rationale) =>
                                      setDraft((current) => ({
                                        ...current,
                                        decisionHistory:
                                          current.decisionHistory.map((item, i) =>
                                            i === index
                                              ? { ...item, rationale }
                                              : item,
                                          ),
                                      }))
                                    }
                                    isDisabled={controlsDisabled}
                                    placeholder="Rationale"
                                  />
                                </VStack>
                                <RowControls
                                  rowLabel="Decision row"
                                  index={index}
                                  count={rows.length}
                                  isDisabled={controlsDisabled}
                                  onMove={(direction) =>
                                    setDraft((current) => ({
                                      ...current,
                                      decisionHistory: moveRow(
                                        current.decisionHistory,
                                        index,
                                        direction,
                                      ),
                                    }))
                                  }
                                  onRemove={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      decisionHistory:
                                        current.decisionHistory.filter(
                                          (_, i) => i !== index,
                                        ),
                                    }))
                                  }
                                />
                              </HStack>
                              <VStack gap={1} width="100%">
                                <Text type="label" color="secondary">
                                  Source message IDs
                                </Text>
                                {row.sourceMessageIds.map(
                                  (sourceMessageId, sourceIndex) => (
                                    <HStack
                                      key={sourceIndex}
                                      gap={2}
                                      vAlign="start"
                                      width="100%"
                                    >
                                      <VStack width="100%" style={{ flex: 1 }}>
                                        <DocInput
                                          ariaLabel={`Source message ID row ${index + 1}.${sourceIndex + 1}`}
                                          value={sourceMessageId}
                                          onChange={(nextValue) =>
                                            setDraft((current) => ({
                                              ...current,
                                              decisionHistory:
                                                current.decisionHistory.map(
                                                  (item, i) =>
                                                    i === index
                                                      ? {
                                                          ...item,
                                                          sourceMessageIds:
                                                            item.sourceMessageIds.map(
                                                              (source, si) =>
                                                                si === sourceIndex
                                                                  ? nextValue
                                                                  : source,
                                                            ),
                                                        }
                                                      : item,
                                                ),
                                            }))
                                          }
                                          isDisabled={controlsDisabled}
                                        />
                                      </VStack>
                                      <RowControls
                                        rowLabel={`Source message ID row ${index + 1}.`}
                                        index={sourceIndex}
                                        count={row.sourceMessageIds.length}
                                        isDisabled={controlsDisabled}
                                        onMove={(direction) =>
                                          setDraft((current) => ({
                                            ...current,
                                            decisionHistory:
                                              current.decisionHistory.map(
                                                (item, i) =>
                                                  i === index
                                                    ? {
                                                        ...item,
                                                        sourceMessageIds: moveRow(
                                                          item.sourceMessageIds,
                                                          sourceIndex,
                                                          direction,
                                                        ),
                                                      }
                                                    : item,
                                              ),
                                          }))
                                        }
                                        onRemove={() =>
                                          setDraft((current) => ({
                                            ...current,
                                            decisionHistory:
                                              current.decisionHistory.map(
                                                (item, i) =>
                                                  i === index
                                                    ? {
                                                        ...item,
                                                        sourceMessageIds:
                                                          item.sourceMessageIds.filter(
                                                            (_, si) =>
                                                              si !== sourceIndex,
                                                          ),
                                                      }
                                                    : item,
                                              ),
                                          }))
                                        }
                                      />
                                    </HStack>
                                  ),
                                )}
                                <Button
                                  label={`Add source message ID to decision row ${index + 1}`}
                                  icon={<Plus pack="basic" size="sm" />}
                                  variant="ghost"
                                  size="sm"
                                  isDisabled={controlsDisabled}
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      decisionHistory: current.decisionHistory.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                sourceMessageIds: [
                                                  ...item.sourceMessageIds,
                                                  "",
                                                ],
                                              }
                                            : item,
                                      ),
                                    }))
                                  }
                                />
                              </VStack>
                            </VStack>
                          ))}
                          <Button
                            label="Add decision row"
                            icon={<Plus pack="basic" size="sm" />}
                            variant="ghost"
                            size="sm"
                            isDisabled={controlsDisabled}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                decisionHistory: [
                                  ...current.decisionHistory,
                                  { decision: "", rationale: "", sourceMessageIds: [] },
                                ],
                              }))
                            }
                          />
                        </VStack>
                      );
                    })()
                  : null}

                {section.kind === "flow"
                  ? (() => {
                      const journeys = value as PRDDocument["userJourneys"];
                      // Prose journeys stay editable as text; an actual flow is
                      // authored on the User Flows canvas, so it is shown here
                      // read-only rather than as an editable field.
                      if (journeys === null || typeof journeys === "string") {
                        return (
                          <DocTextArea
                            ariaLabel={section.label}
                            value={journeys ?? ""}
                            placeholder={`Write the ${section.label.toLowerCase()}…`}
                            onChange={(nextValue) =>
                              setDraft((current) => ({
                                ...current,
                                [section.field]: nextValue,
                              }))
                            }
                            isDisabled={controlsDisabled}
                            hasAutoFocus={isJustRestored}
                          />
                        );
                      }
                      return (
                        <VStack gap={2} width="100%">
                          <FlowPreviewDiagram
                            layout={layoutFlowPreview(journeys)}
                          />
                          <Text type="supporting" color="secondary">
                            User journeys are authored on the User Flows canvas.
                            Open it to edit this flow.
                          </Text>
                        </VStack>
                      );
                    })()
                  : null}
              </EditableSection>
            </VStack>
          );
        })}
      </VStack>
      <EditorActions
        isDisabled={!canEdit}
        isDirty={isDirty}
        isSaving={isSaving}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    </VStack>
  );
}
