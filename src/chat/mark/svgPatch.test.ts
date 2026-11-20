import { describe, expect, test } from "vitest";
import { el } from "./render/svgTree";
import { buildTreeIndex } from "./svgPatch";

// The DOM path of patchSvg is covered in svgPatch.dom.test.ts (happy-dom).

describe("buildTreeIndex", () => {
  test("flattens tag/attr/value/sentinel in depth-first order", () => {
    const tree = el("g", { a: "1" }, [el("path", { d: "M0" }), el("stop", {})],);
    const { names, values } = buildTreeIndex(tree);
    // g -> attr a -> path -> attr d -> '/' -> stop -> '/' -> '/'
    expect(names).toEqual(["g", "a", "path", "d", "/", "stop", "/", "/"]);
    expect(values).toEqual(["1", "M0"]);
  });

  test("different trees yield different names (structure change detection)", () => {
    const treeA = buildTreeIndex(el("g", { a: "1" }, [el("path", { d: "M0" })]));
    const treeB = buildTreeIndex(el("g", { a: "1" }, [el("rect", { x: 1 })]));
    expect(treeA.names).not.toEqual(treeB.names);
  });

  test("same structure, different values: names identical, values differ", () => {
    const treeA = buildTreeIndex(el("g", { a: "1" }, [el("path", { d: "M0" })]));
    const treeB = buildTreeIndex(el("g", { a: "2" }, [el("path", { d: "M1" })]));
    expect(treeA.names).toEqual(treeB.names);
    expect(treeA.values).not.toEqual(treeB.values);
    expect(treeB.values).toEqual(["2", "M1"]);
  });
});
