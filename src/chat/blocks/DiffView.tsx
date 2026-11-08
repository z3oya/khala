import type { DiffHunk } from "../types";

export function DiffView({ hunks }: { hunks: DiffHunk[] }) {
  return (
    <div className="diff" data-testid="chat-diff">
      {hunks.map((hunk, hi) => (
        <div key={`${hunk.header}-${hi}`} className="diff-hunk">
          <div className="diff-hunk-header">{hunk.header}</div>
          {hunk.lines.map((line, i) => {
            const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
            return (
              <div key={i} className={`diff-row diff-${line.kind}`}>
                <span className="diff-ln">{line.oldLine ?? ""}</span>
                <span className="diff-ln">{line.newLine ?? ""}</span>
                <span className="diff-text">
                  <span className="diff-sign">{sign}</span>
                  {line.text}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
