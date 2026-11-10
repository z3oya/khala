import { describe, expect, it } from "vitest";
import {
  extractActivePromptInputTrigger,
  filterPromptInputSuggestions,
  getActivePromptInputTokenTailLength,
  type PromptScorableItem,
} from "./promptInputTriggers";

describe("extractActivePromptInputTrigger", () => {
  it("detects all four triggers at line start / after whitespace", () => {
    expect(extractActivePromptInputTrigger("@foo")).toEqual({ trigger: "@", query: "foo" });
    expect(extractActivePromptInputTrigger("/go")).toEqual({ trigger: "/", query: "go" });
    expect(extractActivePromptInputTrigger("$web")).toEqual({ trigger: "$", query: "web" });
    expect(extractActivePromptInputTrigger("look #")).toEqual({ trigger: "#", query: "" });
    expect(extractActivePromptInputTrigger("hello @foo")).toEqual({ trigger: "@", query: "foo" });
  });

  it("rejects triggers glued to plain text without a boundary", () => {
    expect(extractActivePromptInputTrigger("a/b")).toBeNull();
    expect(extractActivePromptInputTrigger("mail@host")).toBeNull();
  });

  it("allows Han-adjacent @ but suppresses email-shaped queries", () => {
    expect(extractActivePromptInputTrigger("看看@文件")).toEqual({ trigger: "@", query: "文件" });
    expect(extractActivePromptInputTrigger("联系邮箱@example.com")).toBeNull();
    expect(extractActivePromptInputTrigger("用户@例子.公司")).toBeNull();
    expect(extractActivePromptInputTrigger("联系@example")).toEqual({
      trigger: "@",
      query: "example",
    });
  });

  it("keeps @ triggering after CJK punctuation with domain-like query", () => {
    expect(extractActivePromptInputTrigger("看看，@foo.bar")).toEqual({
      trigger: "@",
      query: "foo.bar",
    });
  });

  it("normalizes ¥/￥ skill alias to $", () => {
    expect(extractActivePromptInputTrigger("¥web")).toEqual({ trigger: "$", query: "web" });
    // 汉字紧邻的边界放宽只给 @；￥ 需要行首/空白边界
    expect(extractActivePromptInputTrigger("用￥技能")).toBeNull();
    expect(extractActivePromptInputTrigger("用 ￥技能")).toEqual({ trigger: "$", query: "技能" });
  });
});

describe("getActivePromptInputTokenTailLength", () => {
  it("never swallows tail text for a bare trigger", () => {
    const trigger = extractActivePromptInputTrigger("ok /")!;
    expect(trigger).toEqual({ trigger: "/", query: "" });
    expect(getActivePromptInputTokenTailLength(trigger, "goal rest", "goal")).toBe(0);
  });

  it("replaces only the untyped candidate suffix (/go|al)", () => {
    const trigger = extractActivePromptInputTrigger("ok /go")!;
    expect(getActivePromptInputTokenTailLength(trigger, "al rest", "goal")).toBe(2);
  });

  it("keeps body text after a fully typed token (/goal|…)", () => {
    const trigger = extractActivePromptInputTrigger("/goal")!;
    expect(getActivePromptInputTokenTailLength(trigger, " rest", "goal")).toBe(0);
  });
});

describe("filterPromptInputSuggestions", () => {
  const items: PromptScorableItem[] = [
    { id: "1", value: "goal", label: "/goal", description: "set a goal" },
    { id: "2", value: "init", label: "/init", description: "init project" },
    { id: "3", value: "compact", label: "/compact", description: "compact history" },
  ];

  it("returns all suggestions for an empty query", () => {
    expect(filterPromptInputSuggestions(items, "")).toHaveLength(3);
  });

  it("ranks prefix matches first; fuzzy match requires an ordered subsequence", () => {
    const ranked = filterPromptInputSuggestions(items, "co");
    expect(ranked.map((i) => i.value)).toEqual(["compact"]);
  });

  it("matches on description and keywords", () => {
    const kw: PromptScorableItem[] = [
      { id: "1", value: "browser", label: "$browser", description: "", keywords: ["浏览器"] },
    ];
    expect(filterPromptInputSuggestions(kw, "浏览器")[0]!.value).toBe("browser");
  });
});
