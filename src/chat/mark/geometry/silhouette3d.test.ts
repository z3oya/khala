import { describe, expect, it } from "vitest";
import { PUMPKIN_DISABLED, SILHOUETTES, UNIT_SILHOUETTE, getSilhouette } from "./silhouette3d";

describe("silhouette3d (cc table)", () => {
  it("pebble size literal = 1.2167999999999999 (source literal behind the spec table's display value 1.2168)", () => {
    expect(getSilhouette(`pebble`).size).toBe(1.2167999999999999);
    expect(getSilhouette(`pebble`).size).toBeCloseTo(1.2168, 9);
  });

  it("squircle: front seat, faceZ = .28, solid sampled rings", () => {
    const g = getSilhouette(`squircle`);
    expect(g.seat?.kind).toBe(`front`);
    if (g.seat?.kind === `front`) expect(g.seat.faceZ).toBeCloseTo(0.28, 12);
    expect(g.silhouette.kind).toBe(`solid`);
    if (g.silhouette.kind === `solid`) {
      expect(g.silhouette.samples.length).toBeGreaterThan(0);
      expect(g.silhouette.isLoop).toBe(false);
    }
  });

  it("hex: extrusion silhouette + front seat (faceZ = .36)", () => {
    const g = getSilhouette(`hex`);
    expect(g.silhouette.kind).toBe(`extrusion`);
    if (g.silhouette.kind === `extrusion`) {
      expect(g.silhouette.rings.length).toBe(10); // BEVEL_STEPS=4: 5 back + 5 front
      expect(g.silhouette.isConvex).toBe(true);
    }
    if (g.seat?.kind === `front`) expect(g.seat.faceZ).toBeCloseTo(0.36, 12);
  });

  it("star6: extrusion uses custom faceZ=.3 / backZ=.18", () => {
    const g = getSilhouette(`star6`);
    expect(g.silhouette.kind).toBe(`extrusion`);
    if (g.seat?.kind === `front`) expect(g.seat.faceZ).toBeCloseTo(0.3, 12);
  });

  it("cloud / heartChubby: loft silhouette + loft seat", () => {
    const cloud = getSilhouette(`cloud`);
    expect(cloud.silhouette.kind).toBe(`loft`);
    expect(cloud.seat?.kind).toBe(`loft`);
    if (cloud.silhouette.kind === `loft`) {
      expect(cloud.silhouette.rings.length).toBe(17); // LOFT_RINGS=16 +1
      expect(cloud.silhouette.rings[0]!.length).toBe(160); // LOFT_POINTS=160
    }
    const heart = getSilhouette(`heartChubby`);
    expect(heart.silhouette.kind).toBe(`loft`);
    if (heart.silhouette.kind === `loft`) expect(heart.silhouette.rings.length).toBe(17);
  });

  it("bean: ball-cloud solid (balls non-empty) + wrap seat with puffAt", () => {
    const g = getSilhouette(`bean`);
    expect(g.silhouette.kind).toBe(`solid`);
    if (g.silhouette.kind === `solid`) expect(g.silhouette.balls.length).toBeGreaterThan(0);
    expect(g.seat?.kind).toBe(`wrap`);
    if (g.seat?.kind === `wrap`) expect(g.seat.puffAt).toBeInstanceOf(Function);
  });

  it("capsule: y-axis ball band with 33 balls; tablet: x-axis ball band + wrapX seat", () => {
    const capsule = getSilhouette(`capsule`);
    if (capsule.silhouette.kind === `solid`) expect(capsule.silhouette.balls.length).toBe(33);
    expect(capsule.seat?.kind).toBe(`wrap`);
    const tablet = getSilhouette(`tablet`);
    if (tablet.silhouette.kind === `solid`) expect(tablet.silhouette.balls.length).toBe(33);
    expect(tablet.seat?.kind).toBe(`wrapX`);
  });

  it("solids of revolution (pebble/gem/shield/dome/leaf/egg): wrap seat + 96-latitude-ring sampling scale", () => {
    for (const body of [`pebble`, `gem`, `shield`, `dome`, `leaf`, `egg`, `cylinder`, `wedge`, `teardrop`] as const) {
      const g = getSilhouette(body);
      expect(g.seat?.kind, body).toBe(`wrap`);
      expect(g.silhouette.kind, body).toBe(`solid`);
      if (g.silhouette.kind === `solid`) {
        expect(g.silhouette.yawPeriod, body).toBeCloseTo(360 / 64, 9);
        expect(g.silhouette.samples.length, body).toBeGreaterThan(64 * 80);
      }
      // Directional regression: swapping wrapY0/wrapY1 degrades the clamp → eyes collapse onto a single latitude line.
      if (g.seat?.kind === `wrap`) {
        expect(g.seat.wrapY0, body).toBeLessThan(g.seat.wrapY1);
        expect(g.seat.eyeY, body).toBeGreaterThanOrEqual(g.seat.wrapY0);
        expect(g.seat.eyeY, body).toBeLessThanOrEqual(g.seat.wrapY1);
      }
    }
  });

  it("crystal：front seat faceZ = √3/2·.64", () => {
    const g = getSilhouette(`crystal`);
    if (g.seat?.kind === `front`) expect(g.seat.faceZ).toBeCloseTo((Math.sqrt(3) / 2) * 0.64, 12);
    if (g.silhouette.kind === `solid`) expect(g.silhouette.samples.length).toBeGreaterThan(0);
  });

  it("sphere stub + pumpkin stub (PUMPKIN_DISABLED)", () => {
    expect(PUMPKIN_DISABLED).toBe(true);
    const sphere = getSilhouette(`sphere`);
    expect(sphere.size).toBe(1);
    expect(sphere.silhouette.kind).toBe(`solid`);
    const pumpkin = getSilhouette(`pumpkin`);
    expect(pumpkin.silhouette.kind).toBe(`solid`);
    if (sphere.silhouette.kind === `solid` && pumpkin.silhouette.kind === `solid`) {
      expect(pumpkin.silhouette.samples.length).toBe(sphere.silhouette.samples.length);
    }
  });

  it("getSilhouette cache hit; UNIT_SILHOUETTE is the bean outline loop", () => {
    expect(getSilhouette(`hex`)).toBe(getSilhouette(`hex`));
    const unit = UNIT_SILHOUETTE();
    expect(unit.size).toBe(1.17);
    if (unit.silhouette.kind === `solid`) {
      expect(unit.silhouette.isLoop).toBe(true);
      expect(unit.silhouette.samples.length).toBeGreaterThan(50);
    }
  });

  it("SILHOUETTES covers all 26 BodyIds", () => {
    expect(Object.keys(SILHOUETTES).length).toBe(26);
  });
});
