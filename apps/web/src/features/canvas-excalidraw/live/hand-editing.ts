import type { CompileError } from "@meld/screen-runtime";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  convertBoardScreen,
  readBoardConversion,
  readScreenSource,
  saveScreenVersion,
} from "@/features/design/canvas-screen-source";
import {
  boardScreenId,
  formFactorForFrame,
  relinkConvertedFrames,
} from "../design-screen-board";
import { screenIdFromLink } from "../frame-link";
import type { ScreenStore } from "../screen-store";
import { createDraftRegistry } from "./draft-registry";
import { createEditDraft, type Draft } from "./edit-draft";
import {
  createVersionWriter,
  persistDraft,
  type TargetRef,
} from "./edit-target";
import { createLiveController } from "./live-controller";
import type { Computed } from "./live-messages";
import { isValidPick } from "./selection-rules";
import { resolveLiveSource, type LiveSource } from "./live-source";
import { createPublicationBatch } from "./publication-batch";
import type { ScreenCompiler } from "./screen-compiler";

export type PickedElement = {
  boardId: string;
  src: string;
  label: string;
  epoch: number;
  revision: number;
  computed: Computed | null;
};
// How long to wait for the frame to select an element again before giving up.
export const RESELECT_WAIT_MS = 1500;
// How long an edit may take to recompile and reload before its reselect is dropped.
export const RESELECT_COMPILE_WAIT_MS = 10_000;
export function createHandEditing(deps: {
  roomId: string | null;
  access: "edit" | "view";
  store: ScreenStore;
  compiler: ScreenCompiler;
  api: () => ExcalidrawImperativeAPI | null;
  runtimeBundle: () => Promise<string>;
  loadLegacy: (id: string, versionId: string) => Promise<string | null>;
}) {
  const publication = createPublicationBatch(),
    drafts = createDraftRegistry({ notify: publication.notify });
  const targets = new Map<Draft, TargetRef>(),
    keys = new WeakMap<Draft, number>();
  let nextKey = 0,
    active = true,
    picked: PickedElement | null = null,
    // The element an edit just changed, to select again once the frame reloads.
    // `sent` once the frame was asked, until its pick comes back (or it never does).
    reselect: { src: string; screenId: string; sent: boolean } | null = null,
    reselectTimer: ReturnType<typeof setTimeout> | undefined,
    // Asked first when the frame reports Escape (the board leaves Edit there).
    escapeFirst: (() => boolean) | null = null;
  const diagnostics = new Map<
    Draft,
    { revision: number; issues: CompileError[] }
  >();
  const listeners = new Set<() => void>();
  // Told when the frame reports the element that is already picked again (nothing in the store changes).
  const repickListeners = new Set<() => void>();
  let revision = 0;
  function emit() {
    revision++;
    listeners.forEach(publication.notify);
  }
  const resolver = (id: string) =>
    resolveLiveSource(id, {
      roomId: deps.roomId,
      canEdit: deps.access === "edit",
      store: deps.store,
      readSource: readScreenSource,
      readConversion: readBoardConversion,
      loadLegacy: deps.loadLegacy,
    });
  async function loadSource(id: string): Promise<LiveSource | null> {
    const cached = drafts.get(id);
    if (cached) {
      const state = cached.getState();
      return {
        source: state.source,
        revision: state.revision,
        snapshot: targets.get(cached)?.current.kind === "versioned",
        target: targets.get(cached)?.current,
      };
    }
    const resolved = await resolver(id);
    if (!resolved) return null;
    if (!resolved.target || deps.access !== "edit") {
      const readOnly = createEditDraft(
        resolved.source,
        null,
        async () => ({ status: "error" }),
        async () => null,
      );
      const current = drafts.attach(id, readOnly);
      if (current !== readOnly) readOnly.dispose();
      keys.set(current, ++nextKey);
      emit();
      return resolved;
    }
    const again = drafts.get(id);
    if (again) {
      const state = again.getState();
      return { ...resolved, source: state.source, revision: state.revision };
    }
    const target: TargetRef = { current: resolved.target };
    const openedApi = deps.api();
    const frame = openedApi
      ?.getSceneElements()
      .find((e) => e.type === "embeddable" && screenIdFromLink(e.link) === id);
    const writer = createVersionWriter({
      save: saveScreenVersion,
      read: readScreenSource,
    });
    const draft = createEditDraft(
      resolved.source,
      resolved.target.kind === "board" ? null : resolved.target.versionId,
      (source, base, retry) =>
        persistDraft(
          target,
          source,
          base,
          {
            name: "Screen",
            formFactor: formFactorForFrame(
              frame?.width ?? 0,
              frame?.height ?? 0,
            ),
            links: (files) => deps.compiler.links(files),
            versionWriter: writer,
            convert: convertBoardScreen,
            read: readScreenSource,
            converted: (from, screenId) => {
              const to = boardScreenId(screenId);
              publication.batch(() => {
                const old = deps.store.get(from);
                if (old)
                  deps.store.set({
                    ...old,
                    id: to,
                    rev: (deps.store.get(to)?.rev ?? 0) + 1,
                    snapshot: true,
                  });
                const publish = () => {
                  drafts.alias(from, to);
                  live.retargetSource(from, to);
                  live.setSnapshotEligible(to, true);
                  emit();
                };
                if (active && openedApi && deps.api() === openedApi)
                  relinkConvertedFrames(
                    {
                      api: openedApi,
                      store: deps.store,
                      loadDocument: async () => null,
                    },
                    from,
                    to,
                    publish,
                  );
                else publish();
              });
            },
          },
          retry,
        ).then(result=>{
          const current=live.getState();
          if(result.status==="saved" && target.current.kind==="versioned" && current.phase!=="asleep" && drafts.get(current.screenId)===draft)
            live.setSnapshotEligible(current.screenId,true);
          return result;
        }),
      async () => {
        const current = target.current;
        if (current.kind === "board") return null;
        const loaded = await resolver(boardScreenId(current.screenId));
        return loaded?.target && loaded.target.kind !== "board"
          ? { source: loaded.source, versionId: loaded.target.versionId }
          : null;
      },
    );
    drafts.attach(id, draft);
    draft.subscribe(emit);
    targets.set(draft, target);
    keys.set(draft, ++nextKey);
    emit();
    return { ...resolved, revision: draft.getState().revision };
  }
  function validPick(): PickedElement | null {
    const state = live.getState();
    if (!picked || state.phase === "asleep") return null;
    const revision = drafts.get(state.screenId)?.getState().revision ?? null;
    return isValidPick(picked, state.screenId, revision) ? picked : null;
  }
  function clearPicked() {
    if (!picked) return;
    picked = null;
    emit();
  }
  // The wait starts here: it covers the recompile. It restarts, shorter, once the
  // frame is asked, and every other exit (pick, sleep, another screen) clears it.
  function setReselect(src: string | null) {
    clearTimeout(reselectTimer);
    reselectTimer = undefined;
    const state = live.getState();
    const next = src !== null && state.phase !== "asleep" ? { src, screenId: state.screenId, sent: false } : null;
    if (next === null && reselect === null) return;
    reselect = next;
    if (next) reselectTimer = setTimeout(() => setReselect(null), RESELECT_COMPILE_WAIT_MS);
    emit();
  }
  const live = createLiveController({
    loadSource,
    compile: (source) => deps.compiler.compile(source, { tagElements: true }),
    runtimeBundle: deps.runtimeBundle,
    notify: publication.notify,
    onSleepStart: (id) => {
      void drafts.get(id)?.flush();
    },
    onPicked: (boardId, src, label, epoch, revision, computed) => {
      // The same reading again (a chatty or hostile frame) changes nothing, so it must not re-inspect.
      // The user did click it, though: the panel hears that on its own channel, to show Tweak again.
      if (picked && reselect === null && picked.boardId === boardId && picked.src === src && picked.epoch === epoch
        && picked.revision === revision && picked.label === label && JSON.stringify(picked.computed) === JSON.stringify(computed)) {
        [...repickListeners].forEach(listener => listener());
        return;
      }
      picked = { boardId, src, label, epoch, revision, computed };
      clearTimeout(reselectTimer);
      reselectTimer = undefined;
      reselect = null;
      emit();
    },
    onDeselected: () => {
      setReselect(null);
      clearPicked();
    },
    // An element about to be selected again after an edit counts as selected: Escape clears it
    // instead of putting the screen to sleep while the panel still shows it.
    onEscape: () => {
      if (escapeFirst?.()) return true;
      if (!validPick() && reselect === null) return false;
      setReselect(null);
      clearPicked();
      live.clearSelection();
      return true;
    },
    onDraftIssues: (id, revision, issues) => {
      if (issues.length) setReselect(null);
      const draft = drafts.get(id);
      if (!draft || draft.getState().revision !== revision) return;
      diagnostics.set(draft, { revision, issues });
      emit();
    },
    onSnapshot: (id, html) => {
      const old = deps.store.get(id);
      if (old && (!old.snapshot || old.html !== html))
        deps.store.set({ id, rev: old.rev + 1, html, snapshot: true });
    },
  });
  let previousLive=live.getState();
  live.subscribe(()=>{
    const next=live.getState();
    if(picked && (next.attempt!==previousLive.attempt || next.phase==="asleep" || next.phase==="stopped")){
      picked=null;emit();
    }
    // Not on every attempt change: the recompile after an edit is one, and is what a reselect waits for.
    if(reselect && (next.phase==="asleep" || next.phase==="stopped" || next.phase==="compile-failed" || next.screenId!==reselect.screenId))setReselect(null);
    previousLive=next;
  });
  return {
    live,
    drafts,
    loadSource,
    getSnapshot: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeRepick(listener: () => void) {
      repickListeners.add(listener);
      return () => {
        repickListeners.delete(listener);
      };
    },
    async reconcileConversions(api: ExcalidrawImperativeAPI) {
      if (!deps.roomId || deps.access !== "edit" || !active) return;
      const ids = [
        ...new Set(
          api
            .getSceneElements()
            .filter((e) => e.type === "embeddable")
            .map((e) => screenIdFromLink(e.link))
            .filter((id): id is string => !!id && !id.startsWith("ds-")),
        ),
      ];
      for (const from of ids) {
        const mapping = await readBoardConversion(deps.roomId, from);
        if (mapping.status !== "ok")
          throw new Error("Screen conversion lookup failed");
        if (!mapping.screenId) continue;
        if (!active || deps.api() !== api) return;
        const to = boardScreenId(mapping.screenId),
          old = deps.store.get(from);
        publication.batch(() => {
          if (old && !deps.store.get(to))
            deps.store.set({ ...old, id: to, rev: 1, snapshot: true });
          relinkConvertedFrames(
            { api, store: deps.store, loadDocument: async () => null },
            from,
            to,
            () => {
              drafts.alias(from, to);
              live.retargetSource(from, to);
            },
          );
        });
      }
    },
    getPicked: () => picked,
    // The pick if it belongs to the awake screen and the draft revision on screen.
    getValidPick: validPick,
    clearPicked,
    // Remember the element to select again once the recompiled frame is ready.
    setReselect,
    hasReselect: () => reselect !== null,
    // The element source an edit is waiting to select again, or null.
    getReselect: () => reselect?.src ?? null,
    // A handler that may take the frame's Escape before selection and sleep do (true = taken).
    setEscapeFirst(handler: (() => boolean) | null) { escapeFirst = handler; },
    // The element to select again, once. Until its pick arrives the panel stays
    // up, so an edit never makes it blink away and back.
    takeReselect() {
      if (!reselect || reselect.sent) return null;
      reselect.sent = true;
      clearTimeout(reselectTimer);
      reselectTimer = setTimeout(() => setReselect(null), RESELECT_WAIT_MS);
      return reselect.src;
    },
    issues(draft: Draft) {
      const value = diagnostics.get(draft);
      return value?.revision === draft.getState().revision ? value.issues : [];
    },
    identity(draft: Draft) {
      const current = targets.get(draft)?.current;
      return current && current.kind !== "board"
        ? { screenId: current.screenId }
        : null;
    },
    canEdit: (draft: Draft) => deps.access === "edit" && targets.has(draft),
    key: (draft: Draft) => keys.get(draft),
    flushAll(){return Promise.allSettled(drafts.getSnapshot().map(item=>drafts.get(item.boardId)!.flush()));},
    retain() {
      active = true;
      drafts.retain();
    },
    release() {
      active = false;
      live.dispose();
      drafts.release();
    },
  };
}
