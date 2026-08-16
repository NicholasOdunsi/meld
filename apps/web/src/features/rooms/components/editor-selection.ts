// Caret and selection arithmetic for the composer's contenteditable.
//
// The editor renders mentions as Astryx token elements and newlines as <br>,
// so DOM offsets do not line up with offsets into the markdown string the
// composer keeps in state. Everything here converts between the two: a token
// counts as its `data-astryx-token-value`, a <br> counts as one newline.

export type SerializedSelection = {
  start: number;
  end: number;
};

export function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof Element || node instanceof DocumentFragment)) {
    return "";
  }
  if (
    node instanceof HTMLElement &&
    node.hasAttribute("data-astryx-token")
  ) {
    return node.getAttribute("data-astryx-token-value") ?? "";
  }
  if (node instanceof HTMLElement && node.tagName === "BR") {
    return "\n";
  }
  return Array.from(node.childNodes).map(serializeNode).join("");
}

function serializedOffset(
  editor: HTMLElement,
  boundaryNode: Node,
  boundaryOffset: number,
) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(boundaryNode, boundaryOffset);
  return serializeNode(range.cloneContents());
}

export function readEditorSelection(
  editor: HTMLElement | null,
  fallbackOffset: number,
): SerializedSelection {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) {
    return { start: fallbackOffset, end: fallbackOffset };
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return { start: fallbackOffset, end: fallbackOffset };
  }
  return {
    start: serializedOffset(
      editor,
      range.startContainer,
      range.startOffset,
    ).length,
    end: serializedOffset(
      editor,
      range.endContainer,
      range.endOffset,
    ).length,
  };
}

function locateSerializedOffset(editor: HTMLElement, target: number) {
  let remaining = target;

  function visit(parent: Node): { node: Node; offset: number } | null {
    for (let index = 0; index < parent.childNodes.length; index += 1) {
      const child = parent.childNodes[index];
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.textContent?.length ?? 0;
        if (remaining <= length) {
          return { node: child, offset: remaining };
        }
        remaining -= length;
        continue;
      }

      if (
        child instanceof HTMLElement &&
        child.hasAttribute("data-astryx-token")
      ) {
        const length =
          child.getAttribute("data-astryx-token-value")?.length ?? 0;
        if (remaining <= length) {
          return {
            node: parent,
            offset: remaining === 0 ? index : index + 1,
          };
        }
        remaining -= length;
        continue;
      }

      if (child instanceof HTMLElement && child.tagName === "BR") {
        if (remaining <= 1) {
          return {
            node: parent,
            offset: remaining === 0 ? index : index + 1,
          };
        }
        remaining -= 1;
        continue;
      }

      const nested = visit(child);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  return visit(editor) ?? {
    node: editor,
    offset: editor.childNodes.length,
  };
}

export function restoreEditorSelection(
  editor: HTMLElement | null,
  selectionOffsets: SerializedSelection,
) {
  if (!editor) {
    return;
  }
  const start = locateSerializedOffset(editor, selectionOffsets.start);
  const end = locateSerializedOffset(editor, selectionOffsets.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function replaceEditorSelection(
  editor: HTMLElement,
  selectionOffsets: SerializedSelection,
  replacement: string,
  replacementSelection: SerializedSelection,
) {
  const start = locateSerializedOffset(editor, selectionOffsets.start);
  const end = locateSerializedOffset(editor, selectionOffsets.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();

  const replacementNode = document.createTextNode(replacement);
  range.insertNode(replacementNode);

  const nextRange = document.createRange();
  nextRange.setStart(replacementNode, replacementSelection.start);
  nextRange.setEnd(replacementNode, replacementSelection.end);
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

export function normalizeCaretIntoTextNode(
  editor: HTMLElement | null,
) {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (
    range.startContainer !== editor ||
    range.startOffset === 0
  ) {
    return;
  }
  const previousNode = editor.childNodes.item(range.startOffset - 1);
  if (previousNode?.nodeType !== Node.TEXT_NODE) {
    return;
  }
  range.setStart(previousNode, previousNode.textContent?.length ?? 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Backspace directly after a mention token deletes the whole token rather
// than leaving the user editing its rendered text. Returns whether it
// handled the keystroke.
export function removeMentionBeforeCaret(editor: HTMLElement) {
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.isCollapsed ||
    selection.rangeCount === 0
  ) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return false;
  }

  let token: HTMLElement | null = null;
  const trailingSpaces: Node[] = [];
  const { startContainer, startOffset } = range;
  const isTrailingSpace = (node: Node | null) =>
    node?.nodeType === Node.TEXT_NODE &&
    (node.textContent === "" || node.textContent === "\u00a0");
  let previous: Node | null = null;

  if (
    startContainer.nodeType === Node.TEXT_NODE &&
    isTrailingSpace(startContainer) &&
    startOffset <= 1
  ) {
    trailingSpaces.push(startContainer);
    previous = startContainer.previousSibling;
  } else if (startContainer === editor && startOffset > 0) {
    previous = editor.childNodes.item(startOffset - 1);
  }

  while (isTrailingSpace(previous)) {
    trailingSpaces.push(previous!);
    previous = previous?.previousSibling ?? null;
  }
  token =
    previous instanceof HTMLElement &&
    previous.hasAttribute("data-astryx-token")
      ? previous
      : null;

  if (!token) {
    return false;
  }

  const caretOffset = Array.prototype.indexOf.call(
    editor.childNodes,
    token,
  ) as number;
  for (const trailingSpace of trailingSpaces) {
    trailingSpace.parentNode?.removeChild(trailingSpace);
  }
  token.parentNode?.removeChild(token);
  const nextRange = document.createRange();
  nextRange.setStart(editor, Math.max(0, caretOffset));
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
