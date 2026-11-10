import { describe, expect, it } from "vitest";
import {
  buildCommandMentionMarkdown,
  buildFileMentionMarkdown,
  buildSessionMentionMarkdown,
  buildSkillMentionMarkdown,
  formatSkillMentionDisplayLabel,
  parseMentionMarkdown,
} from "./mentionMarkdown";

describe("builders", () => {
  it("file mention gets ./ prefix for bare relative paths", () => {
    expect(buildFileMentionMarkdown("src/a.ts", "a.ts")).toBe("[a.ts](./src/a.ts)");
    expect(buildFileMentionMarkdown("/abs/a.ts", "a.ts")).toBe("[a.ts](/abs/a.ts)");
  });

  it("directory mention keeps a trailing slash", () => {
    expect(buildFileMentionMarkdown("src/components", "components", "directory")).toBe(
      "[components](./src/components/)",
    );
  });

  it("escapes brackets and backslashes in labels and destinations", () => {
    expect(buildFileMentionMarkdown("a[b]\\c.ts", "a[b]")).toBe("[a\\[b\\]](./a[b]\\\\c.ts)");
  });

  it("skill mention links the skill path, falling back to $slug", () => {
    expect(buildSkillMentionMarkdown("web", "./skills/web/SKILL.md")).toBe(
      "[$web](./skills/web/SKILL.md)",
    );
    expect(buildSkillMentionMarkdown("web")).toBe("$web");
  });

  it("session mention links the session id with # label", () => {
    expect(buildSessionMentionMarkdown("s-1", "UI 首版")).toBe("[#UI 首版](#s-1)");
    expect(buildSessionMentionMarkdown("s-1")).toBe("#s-1");
  });

  it("command mention strips duplicated slashes", () => {
    expect(buildCommandMentionMarkdown("/init")).toBe("/init");
  });
});

describe("parseMentionMarkdown", () => {
  it("round-trips file/skill/session link forms into typed parts", () => {
    const parts = parseMentionMarkdown(
      "see [@a.ts](./src/a.ts) and [$web](./skills/web/SKILL.md) plus [#UI 首版](#s-1)",
    );
    expect(parts).toEqual([
      { type: "text", text: "see " },
      { type: "file", label: "a.ts" },
      { type: "text", text: " and " },
      { type: "skill", label: "web" },
      { type: "text", text: " plus " },
      { type: "session", label: "UI 首版" },
    ]);
  });

  it("recovers directory mentions from trailing-slash destinations", () => {
    expect(parseMentionMarkdown("[@components](./src/components/)")[0]).toEqual({
      type: "directory",
      label: "components",
    });
  });

  it("parses inline $skill and /command tokens", () => {
    expect(parseMentionMarkdown("run $web now")).toEqual([
      { type: "text", text: "run " },
      { type: "skill", label: "web" },
      { type: "text", text: " now" },
    ]);
    expect(parseMentionMarkdown("/init the repo")).toEqual([
      { type: "command", label: "init" },
      { type: "text", text: " the repo" },
    ]);
  });

  it("keeps #hashtags and glued tokens as plain text", () => {
    expect(parseMentionMarkdown("see #tag and a/b")).toEqual([
      { type: "text", text: "see #tag and a/b" },
    ]);
  });

  it("parses hand-typed mention links as chips (intentional parity with ZCodium)", () => {
    expect(parseMentionMarkdown("[@x](./y)")[0]).toEqual({ type: "file", label: "x" });
  });

  it("does not treat non-# anchor links as sessions", () => {
    expect(parseMentionMarkdown("[intro](#section)")[0]).toEqual({
      type: "text",
      text: "[intro](#section)",
    });
  });
});

describe("formatSkillMentionDisplayLabel", () => {
  it("title-cases slugs and preserves spaced phrases", () => {
    expect(formatSkillMentionDisplayLabel("code-review")).toBe("Code Review");
    expect(formatSkillMentionDisplayLabel("create artwork")).toBe("create artwork");
  });
});
