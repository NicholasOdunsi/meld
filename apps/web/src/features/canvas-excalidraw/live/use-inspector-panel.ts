"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { createHandEditing } from "./hand-editing";
import type { LivePanelTab } from "./live-panel";
import { escapeAction, isInsidePopup, opensCodeOnWake, shouldShowLivePanel, tweakDisabledReason } from "./selection-rules";
import { useSelectMode } from "./use-select-mode";

type HandEditing = ReturnType<typeof createHandEditing>;

// The board's inspector wiring: when the side panel shows, which tab it is on,
// Escape, Edit and Close. `panelOpen` means one thing: the user is on the
// Code tab. Otherwise the panel shows only while an element is picked.
export function useInspectorPanel(editing: HandEditing, onAsleep?: () => void) {
  const live = editing.live;
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<LivePanelTab>("code");
  // Screens are interactive by default; Edit turns picking on so a click selects an element.
  const [edit, setEdit] = useState(false);
  const editRef = useRef(edit);
  useEffect(() => { editRef.current = edit; }, [edit]);
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  useSyncExternalStore(editing.subscribe, editing.getSnapshot, editing.getSnapshot);

  const showCode = useCallback(() => { setPanelTab("code"); setPanelOpen(true); }, []);
  const editableNow = useCallback(() => {
    const state = live.getState();
    const draft = state.phase === "asleep" ? undefined : editing.drafts.get(state.screenId);
    return !!draft && editing.canEdit(draft);
  }, [editing, live]);
  const tweakReason = useCallback(() => tweakDisabledReason({ editable: editableNow(), hasPick: editing.getValidPick() !== null, reselecting: editing.hasReselect() }), [editableNow, editing]);
  // Tweak with nothing selected would have nothing to show: the tab is disabled then, never a silent close.
  const onTabChange = useCallback((tab: LivePanelTab) => {
    if (tab === "tweak" && tweakReason()) return;
    setPanelTab(tab);
    setPanelOpen(tab === "code");
  }, [tweakReason]);
  // After a wake: Code when asked for, on a compile failure, or when the screen can't be edited.
  const afterWake = useCallback((tab: LivePanelTab) => {
    if (opensCodeOnWake({ phase: live.getState().phase, tab, editable: editableNow() })) showCode();
  }, [editableNow, live, showCode]);
  const clearSelection = useCallback(() => {
    editing.setReselect(null);
    editing.clearPicked();
    live.clearSelection();
  }, [editing, live]);
  const close = useCallback(() => { setPanelOpen(false); clearSelection(); }, [clearSelection]);
  // Turning Edit off clears the selection (and so closes the Tweak panel); Code stays if it was opened.
  const toggleEdit = useCallback(() => {
    const next = !edit;
    setEdit(next);
    if (!next) clearSelection();
  }, [clearSelection, edit]);
  // Escape from inside the screen (it has the keyboard while it is interactive) follows the same order as
  // the board's: a selection or pending reselect is cleared first (left to the default handler), then Edit ends.
  useEffect(() => {
    if (!edit) return;
    // Takes one Escape only: a second one before React re-renders must reach sleep.
    editing.setEscapeFirst(() => {
      if (editing.getValidPick() !== null || editing.hasReselect()) return false;
      editing.setEscapeFirst(null);
      editRef.current = false;
      setEdit(false);
      return true;
    });
    return () => editing.setEscapeFirst(null);
  }, [editing, edit]);

  useEffect(() => {
    // Capture phase, and no defaultPrevented check: Excalidraw handles Escape
    // itself and may stop or prevent it before a bubbling listener runs.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || live.getState().phase === "asleep") return;
      const action = escapeAction({ hasPick: editing.getValidPick() !== null || editing.hasReselect(), targetInsidePopup: isInsidePopup(event.target), edit: editRef.current });
      if (action === "exit-edit") {
        editRef.current = false;
        editing.setEscapeFirst(null);
        setEdit(false);
      }
      else if (action === "clear-selection") clearSelection();
      else if (action === "sleep") void live.sleep();
    };
    const screenOf = () => { const state = live.getState(); return state.phase === "asleep" ? null : state.screenId; };
    let phase = live.getState().phase;
    let screen = screenOf();
    const unsubscribe = live.subscribe(() => {
      const nextScreen = screenOf();
      if (nextScreen !== screen) { screen = nextScreen; editRef.current = false; setEdit(false); }
      const next = live.getState().phase;
      if (next === phase) return;
      phase = next;
      if (next === "asleep") { setPanelOpen(false); onAsleep?.(); }
      // A screen that can't compile keeps its picture and opens its errors.
      if (next === "compile-failed") showCode();
    });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe();
    };
  }, [clearSelection, editing, live, onAsleep, showCode]);

  // A pick shows the Tweak tab, leaving Code behind: a new element, or the same one clicked again
  // (the store does not change for that, so it comes on its own channel).
  useEffect(() => {
    let previous = editing.getPicked();
    const showTweak = () => { setPanelTab("tweak"); setPanelOpen(false); };
    const stopPicks = editing.subscribe(() => {
      const next = editing.getPicked();
      if (next && next !== previous) showTweak();
      previous = next;
    });
    const stopRepicks = editing.subscribeRepick(showTweak);
    return () => { stopPicks(); stopRepicks(); };
  }, [editing]);

  useSelectMode(live, editing, edit);

  const visible = shouldShowLivePanel({ panelOpen, validPicked: editing.getValidPick() !== null, phase: liveState.phase, reselecting: editing.hasReselect() });
  const tweakDisabled = liveState.phase === "asleep" ? undefined : tweakReason();
  return { liveState, panelOpen, panelTab, edit, visible, tweakDisabled, showCode, afterWake, onTabChange, close, toggleEdit };
}
