"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { setDiagnostics } from "@codemirror/lint";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import type { CompileError } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { Files } from "@meld/screen-runtime/edit/types";
import { copyFile, downloadSource } from "./source-export";

const external = Annotation.define<boolean>();
const permissions = new WeakMap<EditorView, Compartment>();
export type EditorHandlers = {
  editable: boolean;
  change: (text: string) => void;
  undo: () => void;
  redo: () => void;
};
function language(path: string) {
  if (/\.html?$/i.test(path)) return html();
  if (/\.css$/i.test(path)) return css();
  if (/\.[jt]sx?$/i.test(path))
    return javascript({
      jsx: /x$/i.test(path),
      typescript: /\.tsx?$/i.test(path),
    });
  return [];
}
export function createFileEditor(
  parent: HTMLElement,
  path: string,
  initial: string,
  h: EditorHandlers,
): EditorView {
  const permission = new Compartment();
  const historyKey = (act: () => void) => () => {
    if (h.editable) act();
    return true;
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      extensions: [
        language(path),
        permission.of([
          EditorState.readOnly.of(!h.editable),
          EditorView.editable.of(h.editable),
        ]),
        EditorView.contentAttributes.of({ "aria-label": "Source for " + path }),
        Prec.highest(
          keymap.of([
            { key: "Mod-z", run: historyKey(h.undo), stopPropagation: true },
            {
              key: "Mod-Shift-z",
              run: historyKey(h.redo),
              stopPropagation: true,
            },
            { key: "Ctrl-y", run: historyKey(h.redo), stopPropagation: true },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((transaction) =>
              transaction.annotation(external),
            )
          )
            h.change(update.state.doc.toString());
        }),
      ],
    }),
  });
  permissions.set(view, permission);
  return view;
}
export function syncSource(view: EditorView, text: string) {
  if (view.state.doc.toString() === text) return;
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: {
      anchor: Math.min(selection.anchor, text.length),
      head: Math.min(selection.head, text.length),
    },
    annotations: external.of(true),
  });
}
export function syncIssues(
  view: EditorView,
  path: string,
  issues: CompileError[],
) {
  const doc = view.state.doc;
  const list = issues.flatMap((issue) => {
    if (
      issue.file !== path ||
      issue.line === undefined ||
      issue.column === undefined ||
      issue.line < 1 ||
      issue.line > doc.lines ||
      !Number.isInteger(issue.line) ||
      !Number.isFinite(issue.column)
    )
      return [];
    const line = doc.line(issue.line);
    const from = Math.min(
      line.to,
      line.from + Math.max(0, Math.floor(issue.column)),
    );
    return [
      {
        from,
        to: Math.min(line.to, from + 1),
        severity: "error" as const,
        message: issue.message,
      },
    ];
  });
  view.dispatch(setDiagnostics(view.state, list));
}
export type CodeEditorProps = {
  source: ScreenSource;
  onChange: (files: Files) => void;
  readOnly?: boolean;
  issues?: CompileError[];
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onActiveFileChange?: (path: string) => void;
  name?: string;
};
export function CodeEditor(props: CodeEditorProps) {
  const [chosen, setChosen] = useState(props.source.entry);
  const path = Object.hasOwn(props.source.files, chosen)
    ? chosen
    : props.source.entry;
  const [failure, setFailure] = useState<{
    message: string;
    action: "copy" | "download";
  } | null>(null);
  const host = useRef<HTMLElement | null>(null);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const positions = useRef(
    new Map<
      string,
      { anchor: number; head: number; top: number; left: number }
    >(),
  );
  const handlers = useRef<EditorHandlers>({
    editable: !props.readOnly,
    change: (text) => {
      const current = latest.current;
      const active =
        editor.current?.contentDOM
          .getAttribute("aria-label")
          ?.slice("Source for ".length) ?? current.source.entry;
      current.onChange({ ...current.source.files, [active]: text });
    },
    undo: () => latest.current.onUndo?.(),
    redo: () => latest.current.onRedo?.(),
  });
  useLayoutEffect(() => {
    handlers.current.editable = !props.readOnly;
  }, [props.readOnly]);
  useEffect(() => {
    if (!host.current) return;
    const view = createFileEditor(
      host.current,
      path,
      latest.current.source.files[path],
      handlers.current,
    );
    editor.current = view;
    const filePositions = positions.current;
    const saved = filePositions.get(path);
    if (saved) {
      view.dispatch({
        selection: {
          anchor: Math.min(saved.anchor, view.state.doc.length),
          head: Math.min(saved.head, view.state.doc.length),
        },
      });
      view.scrollDOM.scrollTop = saved.top;
      view.scrollDOM.scrollLeft = saved.left;
    }
    latest.current.onActiveFileChange?.(path);
    return () => {
      const selection = view.state.selection.main;
      filePositions.set(path, {
        anchor: selection.anchor,
        head: selection.head,
        top: view.scrollDOM.scrollTop,
        left: view.scrollDOM.scrollLeft,
      });
      view.destroy();
      if (editor.current === view) editor.current = null;
    };
  }, [path]);
  useEffect(() => {
    const view = editor.current;
    if (view) syncSource(view, props.source.files[path]);
  }, [props.source, path]);
  useEffect(() => {
    const view = editor.current;
    if (view) syncIssues(view, path, props.issues ?? []);
  }, [props.issues, path]);
  useEffect(() => {
    const view = editor.current;
    const permission = view && permissions.get(view);
    if (view && permission)
      view.dispatch({
        effects: permission.reconfigure([
          EditorState.readOnly.of(!!props.readOnly),
          EditorView.editable.of(!props.readOnly),
        ]),
      });
  }, [props.readOnly, path]);
  async function perform(action: "copy" | "download") {
    try {
      if (action === "copy") await copyFile(latest.current.source, path);
      else
        await downloadSource(
          latest.current.source,
          latest.current.name ?? "screen",
        );
      setFailure(null);
    } catch (error) {
      setFailure({
        message:
          error instanceof Error
            ? error.message
            : "This source could not be exported.",
        action,
      });
    }
  }
  return (
    <VStack gap={2}>
      <HStack gap={2} wrap="wrap">
        <Button label="Copy" onClick={() => void perform("copy")} />
        <Button label="Download" onClick={() => void perform("download")} />
        <Button
          label="Undo"
          onClick={props.onUndo}
          isDisabled={props.readOnly || !props.canUndo}
        />
        <Button
          label="Redo"
          onClick={props.onRedo}
          isDisabled={props.readOnly || !props.canRedo}
        />
      </HStack>
      {Object.keys(props.source.files).length > 1 ? (
        <TabList value={path} onChange={setChosen} size="sm">
          {Object.keys(props.source.files).map((file) => (
            <Tab key={file} value={file} label={file} />
          ))}
        </TabList>
      ) : <Text type="supporting">{path}</Text>}
      {failure ? (
        <Banner
          status="error"
          title={failure.message}
          endContent={
            <Button
              label="Retry"
              onClick={() => void perform(failure.action)}
            />
          }
        />
      ) : null}
      {(props.issues ?? []).map((issue, index) => (
        <Text key={index}>
          {issue.file ? `${issue.file}: ` : ""}
          {issue.message}
        </Text>
      ))}
      <VStack ref={host} minHeight={280} />
    </VStack>
  );
}
export default CodeEditor;
