"use client";

import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import type { FreeformDocument, FreeformNode } from "@meld/contracts";
import { Node as TiptapNode, type Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PixelBold as Bold,
  PixelCheckSquare as CheckSquare,
  PixelChevronLeft as Undo,
  PixelChevronRight as Redo,
  PixelCode as Code,
  PixelItalic as Italic,
  PixelLink as Link,
  PixelListOl as ListOl,
  PixelListUl as ListUl,
  PixelQuoteLeft as Quote,
} from "@/ui/pixel-icons";
import { useRoomComposerContext } from "@/features/rooms/components/room-composer-context";
import styles from "./freeform-document-editor.module.css";

const IDENTIFIED_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
];

function editorExtensions(canEdit: boolean) {
  const FlowPreviewNode = TiptapNode.create({
    name: "flowPreview",
    group: "block",
    atom: true,
    selectable: true,
    addAttributes: () => ({
      meldId: { default: null },
      flow: { default: null },
      href: { default: null },
    }),
    parseHTML: () => [{ tag: "div[data-flow-preview]" }],
    renderHTML: ({ HTMLAttributes }) => [
      "div",
      { ...HTMLAttributes, "data-flow-preview": "true" },
      "User journey canvas",
    ],
    addNodeView: () => ({ node }) => {
      const wrapper = document.createElement("p");
      const href = typeof node.attrs.href === "string" ? node.attrs.href : "";
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = "Open this journey on Canvas";
        wrapper.appendChild(link);
      } else {
        wrapper.textContent = "User journey canvas";
      }
      return { dom: wrapper };
    },
  });
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: true, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FlowPreviewNode,
    Placeholder.configure({ placeholder: "Start writing or paste your document..." }),
    UniqueID.configure({
      attributeName: "meldId",
      types: IDENTIFIED_NODE_TYPES,
      generateID: () => crypto.randomUUID(),
    }),
  ];
}

function snapshot(title: string, body: unknown): FreeformDocument {
  return {
    format: "blocks-v1",
    title,
    body: body as FreeformDocument["body"],
  };
}

function CommandButton({
  label,
  icon,
  isActive = false,
  isDisabled = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      label={label}
      tooltip={label}
      icon={icon}
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      isIconOnly
      isDisabled={isDisabled}
      onClick={onClick}
    />
  );
}

function FormattingMenu({
  editor,
  onLink,
  onAction,
  onAddToChat,
}: {
  editor: Editor;
  onLink: () => void;
  onAction: () => void;
  onAddToChat?: () => void;
}) {
  function action(run: () => void) {
    return () => {
      run();
      onAction();
    };
  }

  return (
    <HStack
      className={styles.floatingMenu}
      gap={0.5}
      style={{
        width: "max-content",
        maxWidth: "calc(100vw - (var(--meld-space-4) * 2))",
        overflowX: "auto",
        clipPath: "var(--meld-pixel-corner)",
        background: "var(--meld-surface)",
        padding: "var(--meld-space-1)",
        color: "var(--meld-text)",
      }}
      data-document-format-menu="true"
      role="toolbar"
      aria-label="Document formatting"
    >
      <DropdownMenu
        button={{ label: "Text style", variant: "ghost", size: "sm" }}
        items={[
          {
            label: "Paragraph",
            onClick: action(() =>
              editor
                .chain()
                .focus(undefined, { scrollIntoView: false })
                .setParagraph()
                .run(),
            ),
          },
          ...([1, 2, 3] as const).map((level) => ({
            label: `Heading ${level}`,
            onClick: action(() =>
              editor
                .chain()
                .focus(undefined, { scrollIntoView: false })
                .toggleHeading({ level })
                .run(),
            ),
          })),
        ]}
      />
      <CommandButton
        label="Bold"
        icon={<Bold pack="basic" size="sm" />}
        isActive={editor.isActive("bold")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBold()
            .run(),
        )}
      />
      <CommandButton
        label="Italic"
        icon={<Italic pack="basic" size="sm" />}
        isActive={editor.isActive("italic")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleItalic()
            .run(),
        )}
      />
      <CommandButton
        label="Bulleted list"
        icon={<ListUl pack="basic" size="sm" />}
        isActive={editor.isActive("bulletList")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBulletList()
            .run(),
        )}
      />
      <CommandButton
        label="Numbered list"
        icon={<ListOl pack="basic" size="sm" />}
        isActive={editor.isActive("orderedList")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleOrderedList()
            .run(),
        )}
      />
      <CommandButton
        label="Checklist"
        icon={<CheckSquare pack="basic" size="sm" />}
        isActive={editor.isActive("taskList")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleTaskList()
            .run(),
        )}
      />
      <CommandButton
        label="Quote"
        icon={<Quote pack="basic" size="sm" />}
        isActive={editor.isActive("blockquote")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBlockquote()
            .run(),
        )}
      />
      <CommandButton
        label="Code block"
        icon={<Code pack="basic" size="sm" />}
        isActive={editor.isActive("codeBlock")}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleCodeBlock()
            .run(),
        )}
      />
      <CommandButton
        label="Link"
        icon={<Link pack="basic" size="sm" />}
        isActive={editor.isActive("link")}
        onClick={action(onLink)}
      />
      <CommandButton
        label="Undo"
        icon={<Undo pack="basic" size="sm" />}
        isDisabled={!editor.can().undo()}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .undo()
            .run(),
        )}
      />
      <CommandButton
        label="Redo"
        icon={<Redo pack="basic" size="sm" />}
        isDisabled={!editor.can().redo()}
        onClick={action(() =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .redo()
            .run(),
        )}
      />
      {onAddToChat ? (
        <Button
          label="Add to chat"
          variant="ghost"
          size="sm"
          style={{
            fontWeight: "var(--meld-weight-semibold)",
            color: "var(--meld-pink)",
          }}
          onClick={action(onAddToChat)}
        />
      ) : null}
    </HStack>
  );
}

function selectedSection(editor: Editor): {
  label: string;
  quotedText: string;
} | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const quotedText = editor.state.doc.textBetween(from, to, "\n").trim();
  if (!quotedText) return null;

  let label = "Selected text";
  editor.state.doc.forEach((node, offset) => {
    if (offset >= from) return;
    if (node.type.name === "heading" && node.textContent.trim()) {
      label = node.textContent.trim();
    }
  });
  return { label, quotedText };
}

export function FreeformDocumentEditor({
  document,
  canEdit,
  onChange,
  canvasHref,
}: {
  document: FreeformDocument;
  canEdit: boolean;
  onChange?: (document: FreeformDocument) => void;
  canvasHref?: string;
}) {
  const [title, setTitle] = useState(document.title);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const roomComposer = useRoomComposerContext();
  const titleRef = useRef(document.title);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const contextMenuPointRef = useRef<{ x: number; y: number } | null>(null);
  const editor = useEditor({
    extensions: editorExtensions(canEdit),
    content: document.body,
    editable: canEdit,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(snapshot(titleRef.current, currentEditor.getJSON()));
    },
  });

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    if (!editor) return;
    const syncHeadingIds = () => {
      editorContentRef.current
        ?.querySelectorAll<HTMLElement>(
          "h1[data-meldid], h2[data-meldid], h3[data-meldid]",
        )
        .forEach((heading) => {
          const meldId = heading.getAttribute("data-meldid");
          if (meldId) heading.id = meldId;
        });
    };
    syncHeadingIds();
    editor.on("transaction", syncHeadingIds);
    return () => {
      editor.off("transaction", syncHeadingIds);
    };
  }, [editor]);

  function updateTitle(value: string) {
    titleRef.current = value;
    setTitle(value);
    onChange?.(snapshot(value, editor?.getJSON() ?? document.body));
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (!href.trim()) {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .extendMarkRange("link")
        .unsetLink()
        .run();
      return;
    }
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .extendMarkRange("link")
      .setLink({ href })
      .run();
  }

  function addSelectionToChat() {
    if (!editor || !roomComposer) return;
    const selection = selectedSection(editor);
    if (!selection) return;
    roomComposer.addPrdSelection(selection);
  }

  const closeContextMenu = useCallback(() => {
    if (contextMenuPointRef.current === null) return;
    contextMenuPointRef.current = null;
    setIsContextMenuOpen(false);
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta("documentContextMenu", "hide"));
    }
  }, [editor]);

  useEffect(() => {
    if (!isContextMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-document-format-menu="true"]') ||
        target.closest(".astryx-popover")
      ) {
        return;
      }
      closeContextMenu();
    };

    globalThis.document.addEventListener("keydown", closeOnEscape);
    globalThis.document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      globalThis.document.removeEventListener("keydown", closeOnEscape);
      globalThis.document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [closeContextMenu, isContextMenuOpen]);

  function openContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!editor) return;
    event.preventDefault();
    contextMenuPointRef.current = { x: event.clientX, y: event.clientY };
    setIsContextMenuOpen(true);

    if (editor.state.selection.empty) {
      const position = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (position) {
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .setTextSelection(position.pos)
          .run();
        return;
      }
    }
    editor.view.dispatch(
      editor.state.tr.setMeta("documentContextMenu", "show"),
    );
  }

  return (
    <VStack gap={4} width="100%">
      {canEdit && editor ? (
        <>
          <BubbleMenu
            editor={editor}
            pluginKey="documentSelectionMenu"
            className={styles.floatingMenuElevation}
            style={{ filter: "var(--meld-elevation-floating)" }}
            appendTo={() => globalThis.document.body}
            shouldShow={({ state }) =>
              !state.selection.empty && contextMenuPointRef.current === null
            }
            options={{
              shift: {
                boundary: editor.view.dom.parentElement ?? editor.view.dom,
              },
              flip: {
                boundary: editor.view.dom.parentElement ?? editor.view.dom,
              },
              inline: true,
            }}
          >
            <FormattingMenu
              editor={editor}
              onLink={setLink}
              onAction={closeContextMenu}
              onAddToChat={roomComposer ? addSelectionToChat : undefined}
            />
          </BubbleMenu>
          <BubbleMenu
            editor={editor}
            pluginKey="documentContextMenu"
            className={styles.floatingMenuElevation}
            style={{ filter: "var(--meld-elevation-floating)" }}
            appendTo={() => globalThis.document.body}
            getReferencedVirtualElement={() => {
              const point = contextMenuPointRef.current;
              if (!point) return null;
              return {
                getBoundingClientRect: () =>
                  new DOMRect(point.x, point.y, 0, 0),
                contextElement: editor.view.dom,
              };
            }}
            shouldShow={() => contextMenuPointRef.current !== null}
            options={{
              placement: "bottom-start",
              shift: {
                boundary: editor.view.dom.parentElement ?? editor.view.dom,
              },
              flip: {
                boundary: editor.view.dom.parentElement ?? editor.view.dom,
              },
            }}
          >
            <FormattingMenu
              editor={editor}
              onLink={setLink}
              onAction={closeContextMenu}
              onAddToChat={
                roomComposer && !editor.state.selection.empty
                  ? addSelectionToChat
                  : undefined
              }
            />
          </BubbleMenu>
        </>
      ) : null}
      <input
        className={styles.title}
        aria-label="Document title"
        placeholder="Title"
        value={title}
        readOnly={!canEdit}
        autoFocus={canEdit && !document.title}
        onChange={(event) => updateTitle(event.target.value)}
      />
      <EditorContent
        ref={editorContentRef}
        editor={editor}
        className={`${styles.editor} ${canEdit ? "" : styles.readOnly}`}
        onContextMenu={canEdit ? openContextMenu : undefined}
      />
    </VStack>
  );
}

export function ensureTopLevelBlockIds(body: FreeformDocument["body"]) {
  return {
    ...body,
    content: body.content?.map((node: FreeformNode) => ({
      ...node,
      attrs: {
        ...node.attrs,
        meldId:
          typeof node.attrs?.meldId === "string"
            ? node.attrs.meldId
            : crypto.randomUUID(),
      },
    })),
  };
}
