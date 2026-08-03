"use client";

import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { PRDDocument } from "@meld/contracts";
import { useEffect, useMemo, useState } from "react";
import { savePrdVersion } from "../actions";
import { findPrdGaps } from "../prd-review";
import { PRD_SECTIONS } from "../prd-sections";
import type { RoomPrd } from "../schemas";

type ListField =
  | "functionalRequirements"
  | "nonFunctionalRequirements"
  | "uxStatesAndEdgeCases"
  | "dependenciesAndConstraints"
  | "acceptanceCriteria"
  | "openQuestions";

const LIST_FIELDS = new Set<ListField>([
  "functionalRequirements",
  "nonFunctionalRequirements",
  "uxStatesAndEdgeCases",
  "dependenciesAndConstraints",
  "acceptanceCriteria",
  "openQuestions",
]);

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
    <HStack gap={1} wrap="wrap">
      <Button
        label={`Move ${rowLabel} ${index + 1} up`}
        size="sm"
        variant="ghost"
        isDisabled={isDisabled || index === 0}
        onClick={() => onMove(-1)}
      />
      <Button
        label={`Move ${rowLabel} ${index + 1} down`}
        size="sm"
        variant="ghost"
        isDisabled={isDisabled || index === count - 1}
        onClick={() => onMove(1)}
      />
      <Button
        label={`Remove ${rowLabel} ${index + 1}`}
        size="sm"
        variant="destructive"
        isDisabled={isDisabled}
        onClick={onRemove}
      />
    </HStack>
  );
}

function EditorActions({
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

export function PrdEditor({
  initialPrd,
  canEdit,
  onSaved,
  onCancel,
  onDirtyChange,
  onReviewLatest,
}: {
  initialPrd: RoomPrd;
  canEdit: boolean;
  onSaved: (prd: RoomPrd) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onReviewLatest?: () => void;
}) {
  const [draft, setDraft] = useState(() => cloneDocument(initialPrd.document));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialPrd.document),
    [draft, initialPrd.document],
  );
  const gaps = useMemo(() => findPrdGaps(draft), [draft]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function updateList(field: ListField, update: (rows: string[]) => string[]) {
    setDraft((current) => ({ ...current, [field]: update(current[field]) }));
  }

  function resetDraft() {
    setDraft(cloneDocument(initialPrd.document));
    setSaveError(null);
    setConflictVersion(null);
  }

  function handleCancel() {
    resetDraft();
    onCancel();
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

  const controlsDisabled = !canEdit || isSaving;

  return (
    <VStack gap={6} width="100%">
      <EditorActions
        isDisabled={!canEdit}
        isDirty={isDirty}
        isSaving={isSaving}
        onCancel={handleCancel}
        onSave={handleSave}
      />
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
      <VStack gap={3} width="100%">
        <TextInput
          label="Title"
          value={draft.title}
          onChange={(title) => setDraft((current) => ({ ...current, title }))}
          isDisabled={controlsDisabled}
          isRequired
        />
        {PRD_SECTIONS.map((section) => {
          const value = draft[section.field];
          if (section.kind === "prose") {
            return (
              <TextArea
                key={section.id}
                label={section.label}
                value={value as string}
                onChange={(nextValue) =>
                  setDraft((current) => ({
                    ...current,
                    [section.field]: nextValue,
                  }))
                }
                isDisabled={controlsDisabled}
                rows={6}
              />
            );
          }

          if (section.kind === "list" && LIST_FIELDS.has(section.field as ListField)) {
            const field = section.field as ListField;
            const rows = value as string[];
            return (
              <VStack key={section.id} id={section.id} gap={2} width="100%">
                <Heading level={3}>{section.label}</Heading>
                <List density="compact" hasDividers>
                  {rows.map((row, index) => (
                    <ListItem
                      key={`${section.id}-${index}`}
                      label={`${section.label} row ${index + 1}`}
                      description={
                        <VStack gap={2}>
                          <TextInput
                            label={`${section.label} row ${index + 1}`}
                            isLabelHidden
                            value={row}
                            onChange={(nextValue) =>
                              updateList(field, (current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? nextValue : item,
                                ),
                              )
                            }
                            isDisabled={controlsDisabled}
                          />
                          <RowControls
                            rowLabel={`${section.label} row`}
                            index={index}
                            count={rows.length}
                            isDisabled={controlsDisabled}
                            onMove={(direction) =>
                              updateList(field, (current) =>
                                moveRow(current, index, direction),
                              )
                            }
                            onRemove={() =>
                              updateList(field, (current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                          />
                        </VStack>
                      }
                    />
                  ))}
                </List>
                <Button
                  label={`Add ${section.label} row`}
                  variant="secondary"
                  size="sm"
                  isDisabled={controlsDisabled}
                  onClick={() => updateList(field, (rows) => [...rows, ""])}
                />
              </VStack>
            );
          }

          if (section.kind === "mvp") {
            const scope = value as PRDDocument["mvpScope"];
            return (
              <VStack key={section.id} id={section.id} gap={3} width="100%">
                <Heading level={3}>{section.label}</Heading>
                {(["included", "excluded"] as const).map((name) => {
                  const rows = scope[name];
                  const rowLabel = `${name === "included" ? "Included" : "Excluded"} MVP row`;
                  return (
                    <VStack key={name} gap={2}>
                      <Text type="label">{name === "included" ? "Included" : "Excluded"}</Text>
                      <List density="compact" hasDividers>
                        {rows.map((row, index) => (
                          <ListItem
                            key={`${name}-${index}`}
                            label={`${rowLabel} ${index + 1}`}
                            description={
                              <VStack gap={2}>
                                <TextInput
                                  label={`${rowLabel} ${index + 1}`}
                                  isLabelHidden
                                  value={row}
                                  onChange={(nextValue) =>
                                    setDraft((current) => ({
                                      ...current,
                                      mvpScope: {
                                        ...current.mvpScope,
                                        [name]: current.mvpScope[name].map(
                                          (item, itemIndex) =>
                                            itemIndex === index ? nextValue : item,
                                        ),
                                      },
                                    }))
                                  }
                                  isDisabled={controlsDisabled}
                                />
                                <RowControls
                                  rowLabel={rowLabel}
                                  index={index}
                                  count={rows.length}
                                  isDisabled={controlsDisabled}
                                  onMove={(direction) =>
                                    setDraft((current) => ({
                                      ...current,
                                      mvpScope: {
                                        ...current.mvpScope,
                                        [name]: moveRow(current.mvpScope[name], index, direction),
                                      },
                                    }))
                                  }
                                  onRemove={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      mvpScope: {
                                        ...current.mvpScope,
                                        [name]: current.mvpScope[name].filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        ),
                                      },
                                    }))
                                  }
                                />
                              </VStack>
                            }
                          />
                        ))}
                      </List>
                      <Button
                        label={`Add ${rowLabel}`}
                        variant="secondary"
                        size="sm"
                        isDisabled={controlsDisabled}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            mvpScope: {
                              ...current.mvpScope,
                              [name]: [...current.mvpScope[name], ""],
                            },
                          }))
                        }
                      />
                    </VStack>
                  );
                })}
              </VStack>
            );
          }

          if (section.kind === "risks") {
            const rows = value as PRDDocument["risksAndMitigations"];
            return (
              <VStack key={section.id} id={section.id} gap={2} width="100%">
                <Heading level={3}>{section.label}</Heading>
                <List density="compact" hasDividers>
                  {rows.map((row, index) => (
                    <ListItem
                      key={`${section.id}-${index}`}
                      label={`Risk row ${index + 1}`}
                      description={
                        <VStack gap={2}>
                          <TextInput
                            label={`Risk row ${index + 1}`}
                            isLabelHidden
                            value={row.risk}
                            onChange={(risk) =>
                              setDraft((current) => ({
                                ...current,
                                risksAndMitigations: current.risksAndMitigations.map(
                                  (item, itemIndex) =>
                                    itemIndex === index ? { ...item, risk } : item,
                                ),
                              }))
                            }
                            isDisabled={controlsDisabled}
                          />
                          <TextInput
                            label={`Mitigation row ${index + 1}`}
                            value={row.mitigation}
                            onChange={(mitigation) =>
                              setDraft((current) => ({
                                ...current,
                                risksAndMitigations: current.risksAndMitigations.map(
                                  (item, itemIndex) =>
                                    itemIndex === index ? { ...item, mitigation } : item,
                                ),
                              }))
                            }
                            isDisabled={controlsDisabled}
                          />
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
                                risksAndMitigations: current.risksAndMitigations.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              }))
                            }
                          />
                        </VStack>
                      }
                    />
                  ))}
                </List>
                <Button
                  label="Add risk row"
                  variant="secondary"
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
          }

          const rows = value as PRDDocument["decisionHistory"];
          return (
            <VStack key={section.id} id={section.id} gap={2} width="100%">
              <Heading level={3}>{section.label}</Heading>
              <List density="compact" hasDividers>
                {rows.map((row, index) => (
                  <ListItem
                    key={`${section.id}-${index}`}
                    label={`Decision row ${index + 1}`}
                    description={
                      <VStack gap={2}>
                        <TextInput
                          label={`Decision row ${index + 1}`}
                          isLabelHidden
                          value={row.decision}
                          onChange={(decision) =>
                            setDraft((current) => ({
                              ...current,
                              decisionHistory: current.decisionHistory.map(
                                (item, itemIndex) =>
                                  itemIndex === index ? { ...item, decision } : item,
                              ),
                            }))
                          }
                          isDisabled={controlsDisabled}
                        />
                        <TextArea
                          label={`Decision rationale row ${index + 1}`}
                          value={row.rationale}
                          onChange={(rationale) =>
                            setDraft((current) => ({
                              ...current,
                              decisionHistory: current.decisionHistory.map(
                                (item, itemIndex) =>
                                  itemIndex === index ? { ...item, rationale } : item,
                              ),
                            }))
                          }
                          isDisabled={controlsDisabled}
                          rows={3}
                        />
                        <VStack gap={2}>
                          <Text type="label">Source message IDs</Text>
                          <List density="compact" hasDividers>
                            {row.sourceMessageIds.map((sourceMessageId, sourceIndex) => (
                              <ListItem
                                key={`${index}-${sourceIndex}`}
                                label={`Source message ID row ${index + 1}.${sourceIndex + 1}`}
                                description={
                                  <VStack gap={2}>
                                    <TextInput
                                      label={`Source message ID row ${index + 1}.${sourceIndex + 1}`}
                                      isLabelHidden
                                      value={sourceMessageId}
                                      onChange={(nextValue) =>
                                        setDraft((current) => ({
                                          ...current,
                                          decisionHistory: current.decisionHistory.map(
                                            (item, itemIndex) =>
                                              itemIndex === index
                                                ? {
                                                    ...item,
                                                    sourceMessageIds:
                                                      item.sourceMessageIds.map(
                                                        (source, currentSourceIndex) =>
                                                          currentSourceIndex === sourceIndex
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
                                    <RowControls
                                      rowLabel={`Source message ID row ${index + 1}.`}
                                      index={sourceIndex}
                                      count={row.sourceMessageIds.length}
                                      isDisabled={controlsDisabled}
                                      onMove={(direction) =>
                                        setDraft((current) => ({
                                          ...current,
                                          decisionHistory: current.decisionHistory.map(
                                            (item, itemIndex) =>
                                              itemIndex === index
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
                                          decisionHistory: current.decisionHistory.map(
                                            (item, itemIndex) =>
                                              itemIndex === index
                                                ? {
                                                    ...item,
                                                    sourceMessageIds:
                                                      item.sourceMessageIds.filter(
                                                        (_, currentSourceIndex) =>
                                                          currentSourceIndex !== sourceIndex,
                                                      ),
                                                  }
                                                : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </VStack>
                                }
                              />
                            ))}
                          </List>
                          <Button
                            label={`Add source message ID to decision row ${index + 1}`}
                            variant="secondary"
                            size="sm"
                            isDisabled={controlsDisabled}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                decisionHistory: current.decisionHistory.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
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
                              decisionHistory: current.decisionHistory.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        />
                      </VStack>
                    }
                  />
                ))}
              </List>
              <Button
                label="Add decision row"
                variant="secondary"
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
        })}
      </VStack>
      <VStack gap={2} width="100%">
        <Heading level={3}>Gap review</Heading>
        {gaps.length === 0 ? (
          <Text color="secondary">No gaps found.</Text>
        ) : (
          <List density="compact" hasDividers>
            {gaps.map((gap) => (
              <ListItem key={gap.id} label={gap.message} />
            ))}
          </List>
        )}
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
