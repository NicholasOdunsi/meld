import {
  FreeformDocumentSchema,
  type FreeformDocument,
  type FreeformNode,
} from "@meld/contracts";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

const markdown = new MarkdownManager({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ],
});

function identifyTopLevelBlocks(nodes: FreeformNode[] | undefined): FreeformNode[] {
  return (nodes ?? []).map((node) => ({
    ...node,
    attrs: {
      ...node.attrs,
      meldId:
        typeof node.attrs?.meldId === "string"
          ? node.attrs.meldId
          : crypto.randomUUID(),
    },
  }));
}

export function documentToMarkdown(document: FreeformDocument): string {
  const title = document.title.trim() || "Untitled";
  const body = markdown.serialize(document.body).trim();
  return `# ${title}${body ? `\n\n${body}` : ""}\n`;
}

export function markdownToDocument(
  source: string,
  title = "",
): FreeformDocument {
  const parsed = markdown.parse(source) as FreeformDocument["body"];
  return FreeformDocumentSchema.parse({
    format: "blocks-v1",
    title,
    body: {
      ...parsed,
      type: "doc",
      content: identifyTopLevelBlocks(parsed.content),
    },
  });
}
