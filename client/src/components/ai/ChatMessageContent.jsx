import { useState, useMemo } from "react";
import { Copy, Check, Sparkles } from "lucide-react";

/**
 * Robust markdown formatter for AI assistant responses.
 * Parses headings, lists, bold text, inline code, code blocks, tables, and paragraphs.
 */
export const ChatMessageContent = ({ text = "", metadata = null, isUser = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard fallback
    }
  };

  const parsedBlocks = useMemo(() => {
    if (!text) return [];
    const lines = String(text).split("\n");
    const blocks = [];
    let currentParagraph = [];
    let currentList = null; // { type: 'ul' | 'ol', items: [] }
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockLines = [];
    let tableLines = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        blocks.push({ type: "p", content: currentParagraph.join(" ") });
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (currentList && currentList.items.length > 0) {
        blocks.push(currentList);
        currentList = null;
      }
    };

    const flushTable = () => {
      if (tableLines.length >= 2) {
        blocks.push({ type: "table", lines: [...tableLines] });
        tableLines = [];
      } else if (tableLines.length > 0) {
        currentParagraph.push(...tableLines);
        tableLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code blocks (```lang)
      if (trimmed.startsWith("```")) {
        flushParagraph();
        flushList();
        flushTable();
        if (inCodeBlock) {
          blocks.push({
            type: "code",
            lang: codeBlockLang,
            code: codeBlockLines.join("\n"),
          });
          codeBlockLines = [];
          inCodeBlock = false;
          codeBlockLang = "";
        } else {
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Markdown Tables (| cell | cell |)
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushParagraph();
        flushList();
        tableLines.push(trimmed);
        continue;
      } else if (tableLines.length > 0) {
        flushTable();
      }

      // Empty line -> break
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      // Headings
      if (trimmed.startsWith("### ")) {
        flushParagraph();
        flushList();
        blocks.push({ type: "h3", content: trimmed.slice(4) });
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushParagraph();
        flushList();
        blocks.push({ type: "h2", content: trimmed.slice(3) });
        continue;
      }
      if (trimmed.startsWith("# ")) {
        flushParagraph();
        flushList();
        blocks.push({ type: "h1", content: trimmed.slice(2) });
        continue;
      }

      // Unordered lists (- or *)
      const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (ulMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== "ul") {
          flushList();
          currentList = { type: "ul", items: [] };
        }
        currentList.items.push(ulMatch[1]);
        continue;
      }

      // Ordered lists (1. or 2.)
      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (olMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== "ol") {
          flushList();
          currentList = { type: "ol", items: [] };
        }
        currentList.items.push(olMatch[2]);
        continue;
      }

      // Regular paragraph line
      flushList();
      currentParagraph.push(trimmed);
    }

    flushParagraph();
    flushList();
    flushTable();
    if (inCodeBlock && codeBlockLines.length > 0) {
      blocks.push({
        type: "code",
        lang: codeBlockLang,
        code: codeBlockLines.join("\n"),
      });
    }

    return blocks;
  }, [text]);

  const renderInlineFormatted = (str = "") => {
    if (!str) return null;
    // Format bold (**text**), inline code (`code`), and italic (*text*)
    const parts = [];
    const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={match.index} className="font-semibold text-ink-950">
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code
            key={match.index}
            className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-800"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
      }
      lastIndex = match.index + token.length;
    }

    if (lastIndex < str.length) {
      parts.push(str.substring(lastIndex));
    }

    return parts.length > 0 ? parts : str;
  };

  return (
    <div className="relative group">
      {!isUser && text.length > 30 && (
        <div className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 shadow-2xs hover:bg-ink-50 hover:text-ink-900"
            title="Copy answer"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-600">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Alternative Provider Notice */}
      {!isUser && metadata?.fallbackUsed && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-[11px] text-amber-800 font-medium">
          <Sparkles className="h-3 w-3 text-amber-600 shrink-0" />
          <span>Alternative response provider active ({metadata.model || "fallback"})</span>
        </div>
      )}

      {/* Structured Blocks */}
      <div className="space-y-3 leading-relaxed text-ink-900">
        {parsedBlocks.map((block, idx) => {
          if (block.type === "h1") {
            return (
              <h1 key={idx} className="text-base font-bold text-ink-950 border-b border-ink-100 pb-1 mt-2">
                {renderInlineFormatted(block.content)}
              </h1>
            );
          }
          if (block.type === "h2") {
            return (
              <h2 key={idx} className="text-sm font-bold text-ink-950 mt-2">
                {renderInlineFormatted(block.content)}
              </h2>
            );
          }
          if (block.type === "h3") {
            return (
              <h3 key={idx} className="text-xs font-bold uppercase tracking-wider text-ink-700 mt-2">
                {renderInlineFormatted(block.content)}
              </h3>
            );
          }
          if (block.type === "p") {
            return (
              <p key={idx} className="text-xs sm:text-sm">
                {renderInlineFormatted(block.content)}
              </p>
            );
          }
          if (block.type === "ul") {
            return (
              <ul key={idx} className="space-y-1.5 pl-4 text-xs sm:text-sm list-disc">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineFormatted(item)}
                  </li>
                ))}
              </ul>
            );
          }
          if (block.type === "ol") {
            return (
              <ol key={idx} className="space-y-1.5 pl-4 text-xs sm:text-sm list-decimal">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineFormatted(item)}
                  </li>
                ))}
              </ol>
            );
          }
          if (block.type === "code") {
            return (
              <div key={idx} className="my-2 rounded-xl bg-ink-950 p-3 text-xs text-ink-100 overflow-x-auto">
                {block.lang && (
                  <div className="text-[10px] uppercase font-bold text-ink-400 mb-1 border-b border-ink-800 pb-0.5">
                    {block.lang}
                  </div>
                )}
                <pre className="font-mono">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          }
          if (block.type === "table") {
            const rows = block.lines
              .map((l) =>
                l
                  .split("|")
                  .map((c) => c.trim())
                  .filter((c, i, a) => i > 0 && i < a.length - 1),
              )
              .filter((r) => !r.every((c) => /^[-:]+$/.test(c)));
            if (rows.length === 0) return null;
            const [header, ...bodyRows] = rows;
            return (
              <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-ink-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-50 font-semibold text-ink-900 border-b border-ink-200">
                    <tr>
                      {header.map((col, cIdx) => (
                        <th key={cIdx} className="px-3 py-2">
                          {renderInlineFormatted(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {bodyRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-ink-50/50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 text-ink-800">
                            {renderInlineFormatted(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export default ChatMessageContent;
