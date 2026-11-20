// @vitest-environment happy-dom
/** patchSvg DOM-path acceptance (PORTING §5: re-patching the same structure only rewrites values); happy-dom environment. */
import { beforeEach, describe, expect, it } from "vitest";
import { el, svgRoot } from "./render/svgTree";
import { patchSvg } from "./svgPatch";

function makeHost(): HTMLElement {
  const host = document.createElement("span");
  document.body.appendChild(host);
  return host;
}

describe("patchSvg DOM path", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("first patch mounts the svg element tree", () => {
    const host = makeHost();
    patchSvg(host, svgRoot(100, "m1", 100, [el("path", { d: "M0 0Z", fill: "#000" })]));
    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg!.querySelector("path")!.getAttribute("d")).toBe("M0 0Z");
  });

  it("re-patching the same structure reuses DOM nodes and only rewrites changed attribute values", () => {
    const host = makeHost();
    const tree1 = svgRoot(100, "m2", 100, [el("path", { d: "M0 0Z", fill: "#000" })]);
    const tree2 = svgRoot(100, "m2", 100, [el("path", { d: "M1 1L2 2Z", fill: "#000" })]);
    patchSvg(host, tree1);
    const svgBefore = host.querySelector("svg");
    const pathBefore = host.querySelector("path");
    patchSvg(host, tree2);
    expect(host.querySelector("svg")).toBe(svgBefore);
    expect(host.querySelector("path")).toBe(pathBefore);
    expect(pathBefore!.getAttribute("d")).toBe("M1 1L2 2Z");
    expect(pathBefore!.getAttribute("fill")).toBe("#000");
  });

  it("attribute-set changes (added/removed attribute names) rebuild wholesale per source semantics, with correct results", () => {
    // Structure signature = tag + attribute-name sequence: any change in attribute names means a wholesale rebuild.
    const host = makeHost();
    patchSvg(host, svgRoot(100, "m3", 100, [el("circle", { cx: "1", cy: "2", r: "3" })]));
    const circleBefore = host.querySelector("circle");
    patchSvg(host, svgRoot(100, "m3", 100, [el("circle", { cx: "9", opacity: "0.5" })]));
    const circle = host.querySelector("circle")!;
    expect(circle).not.toBe(circleBefore);
    expect(circle.getAttribute("cx")).toBe("9");
    expect(circle.getAttribute("opacity")).toBe("0.5");
    expect(circle.hasAttribute("cy")).toBe(false);
    expect(circle.hasAttribute("r")).toBe(false);
  });

  it("structure changes (child nodes added/removed) trigger a wholesale rebuild", () => {
    const host = makeHost();
    patchSvg(host, svgRoot(100, "m4", 100, [el("path", { d: "M0 0Z" })]));
    const svgBefore = host.querySelector("svg");
    patchSvg(host, svgRoot(100, "m4", 100, [el("path", { d: "M0 0Z" }), el("path", { d: "M1 1Z" })]));
    expect(host.querySelector("svg")).not.toBe(svgBefore);
    expect(host.querySelectorAll("path").length).toBe(2);
  });

  it("repeatedly patching the same tree is idempotent", () => {
    const host = makeHost();
    const tree = svgRoot(100, "m5", 100, [el("path", { d: "M0 0Z" })]);
    patchSvg(host, tree);
    const path = host.querySelector("path");
    patchSvg(host, tree);
    patchSvg(host, tree);
    expect(host.querySelectorAll("path").length).toBe(1);
    expect(host.querySelector("path")).toBe(path);
  });
});
