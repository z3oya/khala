import { describe, expect, test } from "vitest";
import { fnv1a, makeRng } from "./rand";

describe("rand", () => {
  test("fnv1a empty string is the FNV offset basis", () => {
    expect(fnv1a("")).toBe(2166136261);
  });

  test("fnv1a known vector", () => {
    // Reference FNV-1a 32bit: fnv1a("a") = 0xe40c292c
    expect(fnv1a("a")).toBe(0xe40c292c);
  });

  test("makeRng(1) first 5 values (snapshot, computed from source formula)", () => {
    const rng = makeRng(1);
    expect([
      rng(),
      rng(),
      rng(),
      rng(),
      rng(),
    ]).toEqual([
      0.6270739405881613,
      0.002735721180215478,
      0.5274470399599522,
      0.9810509674716741,
      0.9683778982143849,
    ]);
  });
});
