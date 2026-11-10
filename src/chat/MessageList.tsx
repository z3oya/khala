/* Auto-follows the stream unless the user scrolls away. */
import { useLayoutEffect, useMemo, useRef } from "react";
import { Feather, File, Folder, MessagesSquare, SquareSlash, WandSparkles } from "lucide-react";
import type { PermissionDecision, Session } from "./types";
import { localeOf, useI18n } from "./i18n";
import { Markdown } from "./blocks/Markdown";
import { ThinkingBlockView } from "./blocks/ThinkingBlock";
import { ToolCardView } from "./blocks/ToolCard";
import { PermissionCard } from "./blocks/PermissionCard";
import { getPromptMentionClassNames } from "./mentions/mentionChip";
import {
  formatSkillMentionDisplayLabel,
  parseMentionMarkdown,
  type MentionTextPart,
} from "./mentions/mentionMarkdown";
import type { MentionCategory } from "./mentions/mentionTypes";

interface Props {
  session: Session;
  onResolvePermission: (messageId: string, blockId: string, decision: PermissionDecision) => void;
}

function MentionPartIcon({
  type,
}: {
  type: Exclude<MentionTextPart, { type: "text" }>["type"];
}) {
  if (type === "directory") return <Folder aria-hidden="true" size={14} className="mention-bubble-icon" />;
  if (type === "file") return <File aria-hidden="true" size={14} className="mention-bubble-icon" />;
  if (type === "skill") return <WandSparkles aria-hidden="true" size={14} className="mention-bubble-icon" />;
  if (type === "session") return <MessagesSquare aria-hidden="true" size={14} className="mention-bubble-icon" />;
  return <SquareSlash aria-hidden="true" size={14} className="mention-bubble-icon" />;
}

const PART_CATEGORY: Record<Exclude<MentionTextPart, { type: "text" }>["type"], MentionCategory> = {
  file: "files",
  directory: "files",
  skill: "skills",
  command: "commands",
  session: "sessions",
};

/** User-bubble mention chips; class composition is shared with the editor chips. */
function UserText({ markdown }: { markdown: string }) {
  const parts = useMemo(() => parseMentionMarkdown(markdown), [markdown]);
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text") return <span key={index}>{part.text}</span>;
        const category = PART_CATEGORY[part.type];
        return (
          <span
            key={index}
            className={getPromptMentionClassNames(category)}
            data-mention-category={category}
          >
            <MentionPartIcon type={part.type} />
            {part.type === "skill" ? formatSkillMentionDisplayLabel(part.label) : part.label}
          </span>
        );
      })}
    </>
  );
}

function clock(ms: number, locale: string): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function MessageList({ session, onResolvePermission }: Props) {
  const { lang } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const sessionIdRef = useRef(session.id);

  // Switching sessions resets following; layout effect re-anchors before
  // paint so typewriter ticks don't jitter.
  useLayoutEffect(() => {
    if (sessionIdRef.current !== session.id) {
      sessionIdRef.current = session.id;
      followRef.current = true;
    }
    const el = scrollRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [session.id, session.messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    followRef.current = distance < 80;
  };

  return (
    <div className="chat-scroll" ref={scrollRef} onScroll={onScroll} data-testid="chat-thread">
      <div className="chat-thread-inner">
        <div className="thread-divider" data-testid="chat-thread-divider">
          <span>{new Date(session.messages[0]?.atMs ?? Date.now()).toLocaleDateString(localeOf(lang))}</span>
        </div>
        {session.messages.map((message) =>
          message.role === "user" ? (
            <div
              key={message.id}
              className="msg msg-user"
              data-testid="chat-message"
              data-role="user"
              data-streaming="false"
            >
              <div className="user-bubble" data-testid="chat-user-bubble">
                {message.blocks.map((b) =>
                  b.kind === "text" ? <UserText key={b.id} markdown={b.markdown} /> : null,
                )}
              </div>
              <div className="msg-meta-row">{clock(message.atMs, localeOf(lang))}</div>
            </div>
          ) : (
            <div
              key={message.id}
              className="msg msg-assistant"
              data-testid="chat-message"
              data-role="assistant"
              data-streaming={message.streaming ? "true" : "false"}
            >
              <div className="msg-meta-row">
                <span className="assistant-mark">
                  <Feather size={14} />
                </span>
                <span className="assistant-name">khala</span>
                <span className="msg-time">{clock(message.atMs, localeOf(lang))}</span>
              </div>
              <div className="msg-blocks">
                {message.blocks.map((block, i) => {
                  const isLast = i === message.blocks.length - 1;
                  const caret = Boolean(message.streaming && isLast && block.kind === "text");
                  switch (block.kind) {
                    case "text":
                      return <Markdown key={block.id} markdown={block.markdown} caret={caret} />;
                    case "thinking":
                      return <ThinkingBlockView key={block.id} block={block} />;
                    case "tool":
                      return <ToolCardView key={block.id} block={block} />;
                    case "permission":
                      return (
                        <PermissionCard
                          key={block.id}
                          block={block}
                          onResolve={(d) => onResolvePermission(message.id, block.id, d)}
                        />
                      );
                  }
                })}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
