import { describe, expect, test } from "vitest";
import { el, fmt2, fmt2b, round2, serializeSvg, svgRoot } from "./svgTree";

describe("svgTree", () => {
  test("serializeSvg(svgRoot(100,'x',100,[])) roundtrips as <svg …></svg>", () => {
    const s = serializeSvg(svgRoot(100, "x", 100, []));
    expect(s.startsWith("<svg")).toBe(true);
    expect(s.endsWith("</svg>")).toBe(true);
    expect(s).toContain('viewBox="0 0 100 100"');
    expect(s).toContain('id="x"');
    expect(s).toContain('width="100"');
    expect(s).toContain('height="100"');
    expect(s).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test("void tags self-close; nested children serialize in order", () => {
    const s = serializeSvg(
      el("g", { opacity: 1 }, [el("path", { d: "M0 0L1 1" }), el("circle", { cx: 3 })]),
    );
    expect(s).toBe('<g opacity="1"><path d="M0 0L1 1"/><circle cx="3"/></g>');
  });

  test("attribute values are escaped", () => {
    const s = serializeSvg(el("title", {}, [el("path", { "aria-label": `a"&<b` })]));
    expect(s).toContain('aria-label="a&quot;&amp;&lt;b"');
  });

  test("number formatting helpers", () => {
    expect(fmt2(1.005)).toBe("1"); // float: Math.round(100.49999…)/100
    expect(fmt2(1.2349)).toBe("1.23");
    expect(fmt2(1.2351)).toBe("1.24");
    expect(fmt2b(0.123456789)).toBe(0.123457);
    expect(round2(1.006)).toBe(1.01);
  });
});
