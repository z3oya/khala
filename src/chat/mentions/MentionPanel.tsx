/* Presentational; keyboard nav and selectedIndex live in MentionPlugin. */

import { useEffect, useRef, useState } from "react";
import { File, Folder, MessagesSquare, SquareSlash, WandSparkles } from "lucide-react";
import type { MentionCategory, MentionItem } from "./mentionTypes";

export function MentionOptionIcon({ category }: { category: MentionCategory | "directory" }) {
  if (category === "directory") return <Folder aria-hidden="true" className="mention-option-icon" />;
  if (category === "files") return <File aria-hidden="true" className="mention-option-icon" />;
  if (category === "skills") return <WandSparkles aria-hidden="true" className="mention-option-icon" />;
  if (category === "sessions") return <MessagesSquare aria-hidden="true" className="mention-option-icon" />;
  return <SquareSlash aria-hidden="true" className="mention-option-icon" />;
}

interface Props {
  title: string;
  trigger: string;
  sectionTitle: string;
  items: MentionItem[];
  emptyText: string;
  selectedIndex: number;
  hasQuery: boolean;
  footer: React.ReactNode;
  onSelect: (index: number) => boolean;
}

export function MentionPanel({
  title,
  trigger,
  sectionTitle,
  items,
  emptyText,
  selectedIndex,
  hasQuery,
  footer,
  onSelect,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[data-active="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const activeIndex = hoveredIndex ?? selectedIndex;

  return (
    <div className="mention-panel" data-testid="chat-mention-panel" data-trigger={trigger}>
      <div className="mention-panel-header">{sectionTitle}</div>
      {items.length > 0 ? (
        <div ref={listRef} className="mention-panel-list" role="listbox" aria-label={title}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex}
              data-index={index}
              data-testid="chat-mention-option"
              className="mention-option"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(index)}
            >
              <MentionOptionIcon
                category={item.category === "files" && item.data?.kind === "directory" ? "directory" : item.category}
              />
              <span className="mention-option-label">{item.label}</span>
              <span className="mention-option-desc">{item.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mention-panel-empty" data-testid="chat-mention-empty">
          {emptyText}
        </div>
      )}
      {hasQuery ? null : footer}
    </div>
  );
}
