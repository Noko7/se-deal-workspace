import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free Markdown renderer. It only needs to handle the
// structure the Note Formatter prompt asks the model for (headings, ordered &
// unordered lists, task checkboxes, bold/inline code, paragraphs).

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold** and `code`, keeping the delimiters via capture groups.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-charcoal-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-charcoal-100 px-1 py-0.5 font-mono text-[0.85em] text-charcoal-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block =
  | { type: "h1" | "h2" | "h3" | "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "tasks"; items: { text: string; checked: boolean }[] };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isTask = (line: string) => /^\s*[-*]\s+\[[ xX]\]\s+/.test(line);
  const isUl = (line: string) => /^\s*[-*]\s+/.test(line) && !isTask(line);
  const isOl = (line: string) => /^\s*\d+[.)]\s+/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      blocks.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: heading[2] });
      i += 1;
      continue;
    }

    if (isTask(line)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length && isTask(lines[i])) {
        const match = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i]);
        if (match) {
          items.push({ checked: match[1].toLowerCase() === "x", text: match[2] });
        }
        i += 1;
      }
      blocks.push({ type: "tasks", items });
      continue;
    }

    if (isUl(line)) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (isOl(line)) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    blocks.push({ type: "p", text: trimmed });
    i += 1;
  }

  return blocks;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);

  return (
    <div className="space-y-3 text-sm text-charcoal-700">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.type) {
          case "h1":
            return (
              <h2 key={key} className="text-lg font-semibold text-charcoal-900">
                {renderInline(block.text, key)}
              </h2>
            );
          case "h2":
            return (
              <h3 key={key} className="pt-1 text-xs font-semibold uppercase tracking-wide text-iris-600">
                {renderInline(block.text, key)}
              </h3>
            );
          case "h3":
            return (
              <h4 key={key} className="font-semibold text-charcoal-800">
                {renderInline(block.text, key)}
              </h4>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="space-y-1.5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris-100 text-[11px] font-semibold text-iris-700">
                      {itemIndex + 1}
                    </span>
                    <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "tasks":
            return (
              <ul key={key} className="space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        item.checked
                          ? "border-iris-500 bg-iris-500 text-white"
                          : "border-charcoal-300 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    {renderInline(item.text, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={key}>{renderInline(block.text, key)}</p>
            );
        }
      })}
    </div>
  );
}
