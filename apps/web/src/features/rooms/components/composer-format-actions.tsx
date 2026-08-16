"use client";

import { Icon } from "@astryxdesign/core/Icon";
import {
  PixelBold as Bold,
  PixelCode as Code,
  PixelItalic as Italic,
  PixelLink as Link,
  PixelListOl as ListOl,
  PixelListUl as ListUl,
  PixelQuoteLeft as QuoteLeft,
  PixelStrikethrough as Strikethrough,
} from "@/ui/pixel-icons";
import type { ReactNode } from "react";
import type { MarkdownFormat } from "./composer-model";

export type FormatAction = {
  format: MarkdownFormat;
  label: string;
  icon: ReactNode;
};

// Static, so it lives at module scope rather than behind a useMemo.
export const COMPOSER_FORMAT_ACTIONS: readonly FormatAction[] = [
  {
    format: "bold",
    label: "Bold",
    icon: <Icon icon={Bold} size="sm" />,
  },
  {
    format: "italic",
    label: "Italic",
    icon: <Icon icon={Italic} size="sm" />,
  },
  {
    format: "strikethrough",
    label: "Strikethrough",
    icon: <Icon icon={Strikethrough} size="sm" />,
  },
  {
    format: "link",
    label: "Link",
    icon: <Icon icon={Link} size="sm" />,
  },
  {
    format: "bulleted-list",
    label: "Bulleted list",
    icon: <Icon icon={ListUl} size="sm" />,
  },
  {
    format: "numbered-list",
    label: "Numbered list",
    icon: <Icon icon={ListOl} size="sm" />,
  },
  {
    format: "quote",
    label: "Quote",
    icon: <Icon icon={QuoteLeft} size="sm" />,
  },
  {
    format: "inline-code",
    label: "Inline code",
    icon: <Icon icon={Code} size="sm" />,
  },
  {
    format: "code-block",
    label: "Code block",
    icon: <Icon icon={Code} size="sm" />,
  },
];
