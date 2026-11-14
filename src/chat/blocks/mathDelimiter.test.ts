/* Math delimiter tests, including the byte-identity pin for unclosed $$
 * runs and the money-text rejections for inline matching. */
import { describe, expect, it } from "vitest";
import { parseInlineMath, splitMathBlocks } from "./mathDelimiter";

describe("splitMathBlocks", () => {
  it("emits a whole-line $$ open/close pair as one math segment", () => {
    expect(splitMathBlocks(["a", "$$", "x = 1", "$$", "b"])).toEqual([
      { type: "lines", lines: ["a"] },
      { type: "math", tex: "x = 1" },
      { type: "lines", lines: ["b"] },
    ]);
  });

  it("emits a whole-line $$...$$ single as a math segment", () => {
    expect(splitMathBlocks(["  $$E = mc^2$$  "])).toEqual([
      { type: "math", tex: "E = mc^2" },
    ]);
  });

  it("keeps an unclosed $$ run as plain lines, verbatim", () => {
    expect(splitMathBlocks(["a", "$$", "x"])).toEqual([
      { type: "lines", lines: ["a", "$$", "x"] },
    ]);
  });

  it("merges the surrounding lines when no math is present", () => {
    expect(splitMathBlocks(["a", "b"])).toEqual([{ type: "lines", lines: ["a", "b"] }]);
  });

  it("supports multi-line bodies and empty bodies", () => {
    expect(splitMathBlocks(["$$", "a", "", "b", "$$"])).toEqual([
      { type: "math", tex: "a\n\nb" },
    ]);
    expect(splitMathBlocks(["$$", "$$"])).toEqual([{ type: "math", tex: "" }]);
  });

  it("leaves a lone $$ with content but no closer in the lines", () => {
    expect(splitMathBlocks(["$$", "x = 1", "still open"])).toEqual([
      { type: "lines", lines: ["$$", "x = 1", "still open"] },
    ]);
  });
});

describe("parseInlineMath", () => {
  it.each(["$x$", "$f(x)$", "$\\alpha$", "$x = y + z$", "$a_1 + b_2$"])(
    "matches %s",
    (part) => {
      expect(parseInlineMath(part)).not.toBeNull();
    },
  );

  it.each([
    ["$5 to $10"],
    ["costs $5-$10"],
    ["from $10 to $20"],
    ["\\$escaped$"],
    ["$$x$$"],
    ["$ $"],
    ["$100$"],
    ["$5"],
    ["$ tsc && vite build"],
    ["price $ ends here"],
  ])("rejects %s", (part) => {
    expect(parseInlineMath(part)).toBeNull();
  });

  it("extracts the tex source", () => {
    expect(parseInlineMath("$E = mc^2$")).toBe("E = mc^2");
    expect(parseInlineMath("$x$")).toBe("x");
  });
});
