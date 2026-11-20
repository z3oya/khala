/**
 * 2D outline constructors and registry for the 26 shapes; all drawn inside the 228.44 reference frame centered at L=114.2705.
 */
import type { BodyId } from "../types";
import { catmullClosed, clamp, L, normalizeOutline, PathBuilder, sampleParametric } from "./pathUtils";
import { crystalNodes, starFlowerRing } from "./silhouette3d";

type Pt = readonly [number, number];

export function roundedCornerLoop(points: readonly Pt[], radius: number | readonly number[]): string {
  const b = new PathBuilder();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const r = typeof radius === `number` ? radius : radius[i % radius.length]!;
    b.corner(points[(i - 1 + n) % n]!, points[i]!, points[(i + 1) % n]!, r);
  }
  return b.close();
}

export function regularRounded(radius: number, sides: number, corner: number | readonly number[], rot = 0): string {
  return roundedCornerLoop(
    Array.from({ length: sides }, (_t, i) => {
      const a = rot + (i / sides) * Math.PI * 2;
      const pt: [number, number] = [L + Math.cos(a) * radius, L + Math.sin(a) * radius];
      return pt;
    }),
    corner,
  );
}

export function metaballUnion(circles: readonly (readonly [number, number, number])[], samples = 160): string {
  return sampleParametric((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    let best = 0;
    for (const [cx, cy, r] of circles) {
      const dx = cx - L, dy = cy - L;
      const proj = c * dx + s * dy;
      const disc = proj * proj - (dx * dx + dy * dy) + r * r;
      if (disc <= 0) continue;
      const u = proj + Math.sqrt(disc);
      if (u > best) best = u;
    }
    return [L + c * best, L + s * best];
  }, samples);
}

export function superellipse(rx: number, ry: number, n: number): string {
  return sampleParametric((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [L + Math.sign(c) * Math.abs(c) ** (2 / n) * rx, L + Math.sign(s) * Math.abs(s) ** (2 / n) * ry];
  });
}

export function tablet(halfW: number, capR: number): string {
  return new PathBuilder()
    .move(L - halfW + capR, L - capR)
    .line(L + halfW - capR, L - capR)
    .arc(L + halfW - capR, L, capR, capR, -Math.PI / 2, Math.PI / 2)
    .line(L - halfW + capR, L + capR)
    .arc(L - halfW + capR, L, capR, capR, Math.PI / 2, (Math.PI * 3) / 2)
    .close();
}

export function capsuleV(r: number, halfH: number): string {
  return new PathBuilder()
    .move(L - r, L + halfH - r)
    .line(L - r, L - halfH + r)
    .arc(L, L - halfH + r, r, r, Math.PI, Math.PI * 2)
    .line(L + r, L + halfH - r)
    .arc(L, L + halfH - r, r, r, 0, Math.PI)
    .close();
}

export function cylinderSide(rx: number, halfH: number, capRy: number): string {
  return new PathBuilder()
    .move(L - rx, L - halfH + capRy)
    .arc(L, L - halfH + capRy, rx, capRy, Math.PI, Math.PI * 2)
    .line(L + rx, L + halfH - capRy)
    .arc(L, L + halfH - capRy, rx, capRy, 0, Math.PI)
    .close();
}

export function domeShape(halfW: number, halfH: number, capR: number): string {
  const bot = L + halfH;
  return new PathBuilder()
    .move(L - halfW, bot - capR)
    .arc(L, bot - capR, halfW, 2 * halfH - capR, Math.PI, Math.PI * 2)
    .line(L + halfW, bot - capR)
    .curve(L + halfW, bot, L + halfW, bot, L + halfW - capR, bot)
    .line(L - halfW + capR, bot)
    .curve(L - halfW, bot, L - halfW, bot, L - halfW, bot - capR)
    .close();
}

export function archShape(slotR: number, halfH: number, capR: number): string {
  const bot = L + halfH;
  const slotTop = L - halfH + slotR;
  return new PathBuilder()
    .move(L - slotR, slotTop)
    .arc(L, slotTop, slotR, slotR, Math.PI, Math.PI * 2)
    .line(L + slotR, bot - capR)
    .curve(L + slotR, bot, L + slotR, bot, L + slotR - capR, bot)
    .line(L - slotR + capR, bot)
    .curve(L - slotR, bot, L - slotR, bot, L - slotR, bot - capR)
    .close();
}

export function shieldShape(halfW: number, halfH: number, shoulder: number): string {
  const top = L - halfH;
  const bot = L + halfH;
  return new PathBuilder()
    .move(L - halfW, top + shoulder)
    .curve(L - halfW, top - 2, L - halfW * 0.5, top - 10, L, top - 10)
    .curve(L + halfW * 0.5, top - 10, L + halfW, top - 2, L + halfW, top + shoulder)
    .curve(L + halfW, L + halfH * 0.42, L + halfW * 0.62, bot, L, bot)
    .curve(L - halfW * 0.62, bot, L - halfW, L + halfH * 0.42, L - halfW, top + shoulder)
    .close();
}

export function eggShape(rx: number, ry: number, k: number): string {
  return sampleParametric((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const taper = (1 - s) / 2;
    return [L + c * rx * (1 - k * taper * taper), L + s * ry];
  });
}

export function beltShape(halfW: number, topY: number, bottomY: number, cornerR: number): string {
  const t = clamp(halfW / (bottomY - topY), -1, 1);
  const a = Math.sqrt(1 - t * t);
  const right: [number, number] = [L + halfW * a, bottomY - halfW * t];
  const left: [number, number] = [L - halfW * a, bottomY - halfW * t];
  const sweep = Math.atan2(right[1] - bottomY, right[0] - L);
  return new PathBuilder()
    .corner(right, [L, topY], left, cornerR)
    .line(left[0], left[1])
    .arc(L, bottomY, halfW, halfW, Math.PI - sweep, sweep)
    .close();
}

export function roundedRect(half: number, corner: number): string {
  return roundedCornerLoop(
    [[L - half, L - half], [L + half, L - half], [L + half, L + half], [L - half, L + half]] as Pt[],
    corner,
  );
}

export function houseShape(halfW: number, legH: number, roofInset: number, corner: number): string {
  return roundedCornerLoop(
    [
      [L - halfW, L + legH],
      [L + halfW, L + legH],
      [L + halfW, L - legH + roofInset],
      [L, L - legH],
      [L - halfW, L - legH + roofInset],
    ] as Pt[],
    corner,
  );
}

export function clover(offset: number, r: number): string {
  return metaballUnion([
    [L - offset, L - offset, r],
    [L + offset, L - offset, r],
    [L + offset, L + offset, r],
    [L - offset, L + offset, r],
  ]);
}

export function leafShape(halfW: number, halfH: number, n: number): string {
  return sampleParametric((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [L + c * halfW * Math.max(1 - s * s, 0) ** (n / 2 - 0.5) * 1, L + s * halfH];
  });
}

export function twoLobe(rx: number, ry: number, amount: number, phase: number): string {
  return sampleParametric((i) => {
    const gauss = (e: number): number => {
      const d = Math.abs((((i - e + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      return Math.exp(-(d * d) / 0.4232);
    };
    const o = 1 - amount * gauss(phase) + amount * 0.34 * gauss(phase + Math.PI);
    return [L + Math.cos(i) * rx * o, L + Math.sin(i) * ry * o];
  });
}

export function harmonicBlob(radius: number, amp: number, phase: number): string {
  return sampleParametric((r) => {
    const rr = radius * (1 + amp * (Math.sin(r * 2 + phase) * 0.6 + Math.sin(r * 3 - phase) * 0.4));
    return [L + Math.cos(r) * rr, L + Math.sin(r) * rr * 0.98];
  });
}

// Hand-drawn path literal (copied character-for-character from SRC)
export const HEART_PATH = `M79.4511 11.5693C94.8767 -3.85636 119.887 -3.85622 135.312 11.5693C150.738 26.995 150.738 52.0049 135.312 67.4306L129.302 73.4404L129.303 73.4414L83.7724 118.972C81.8111 120.933 79.4309 122.22 76.9199 122.833C76.463 122.944 76.0018 123.034 75.538 123.101C74.1477 123.301 72.734 123.301 71.3437 123.101C70.8802 123.034 70.4194 122.944 69.9628 122.833C69.8486 122.805 69.7347 122.776 69.621 122.745C69.3938 122.684 69.1679 122.616 68.9433 122.544C67.4837 122.073 66.0831 121.367 64.8017 120.426C64.6047 120.281 64.4108 120.13 64.2197 119.975C63.837 119.662 63.466 119.328 63.1093 118.972L11.5693 67.4306C-3.85643 52.0049 -3.85642 26.995 11.5693 11.5693C26.995 -3.85643 52.0049 -3.85643 67.4306 11.5693L73.4404 17.579L79.4511 11.5693Z`;

// Hand-drawn path literal (copied character-for-character from SRC)
export const STAR6_PATH = `M58.9438 9.25323C63.2492 -3.08441 80.6974 -3.08441 85.0027 9.25322L91.7612 28.6207C94.0136 35.0751 100.652 38.9078 107.368 37.6311L127.52 33.8004C140.357 31.3602 149.081 46.4708 140.549 56.3681L127.156 71.9049C122.692 77.0827 122.692 84.748 127.156 89.9258L140.549 105.463C149.081 115.36 140.357 130.471 127.52 128.03L107.368 124.2C100.652 122.923 94.0136 126.756 91.7612 133.21L85.0027 152.577C80.6974 164.915 63.2492 164.915 58.9438 152.577L52.1853 133.21C49.933 126.756 43.2946 122.923 36.5788 124.2L16.4268 128.03C3.58942 130.471 -5.1347 115.36 3.39733 105.463L16.7908 89.9258C21.2543 84.748 21.2543 77.0827 16.7908 71.9049L3.39734 56.3681C-5.13469 46.4708 3.58941 31.3602 16.4268 33.8004L36.5787 37.6311C43.2946 38.9078 49.933 35.0751 52.1853 28.6207L58.9438 9.25323Z`;

// Hand-drawn path literal (copied character-for-character from SRC)
export const SPARKLE_PATH = `M93.9365 0.100586C98.4439 -0.387322 102.691 0.897134 106.341 4.03418C111.502 8.47087 114.842 16.0545 116.636 25.2725C118.36 34.1341 118.716 44.8177 117.701 56.4346L117.707 56.4375L117.706 56.4443C122.25 58.5638 126.519 60.8171 130.449 63.168C130.485 63.1891 130.52 63.2103 130.556 63.2314C131.25 63.6478 131.934 64.067 132.607 64.4893C132.68 64.5349 132.753 64.5813 132.825 64.627C133.074 64.7838 133.322 64.941 133.567 65.0986C133.692 65.1787 133.816 65.2596 133.94 65.3398C134.138 65.4676 134.335 65.5954 134.53 65.7236C134.653 65.8039 134.775 65.8844 134.896 65.9648C135.112 66.1073 135.325 66.2506 135.538 66.3936C135.625 66.4522 135.713 66.5106 135.8 66.5693C138.866 68.645 141.667 70.7792 144.163 72.9502C149.754 77.8126 153.981 83.0002 156.136 88.2578C156.159 88.3133 156.181 88.3693 156.203 88.4248C156.268 88.5868 156.332 88.749 156.393 88.9111C156.435 89.0226 156.475 89.1346 156.516 89.2461C156.541 89.3175 156.566 89.3895 156.591 89.4609C157.443 91.8917 157.839 94.3199 157.696 96.7109C157.522 99.7997 156.469 102.655 154.613 105.192C154.236 105.709 153.826 106.208 153.388 106.692C153.365 106.717 153.343 106.742 153.32 106.767C153.171 106.93 153.019 107.091 152.863 107.25C152.844 107.27 152.824 107.29 152.804 107.311C152.3 107.822 151.762 108.316 151.191 108.79C151.168 108.81 151.144 108.83 151.12 108.85C150.952 108.988 150.781 109.125 150.607 109.261C150.558 109.299 150.509 109.337 150.46 109.375C150.282 109.512 150.101 109.648 149.917 109.781C149.903 109.792 149.888 109.801 149.874 109.812C149.255 110.26 148.605 110.689 147.926 111.1C147.795 111.179 147.662 111.256 147.528 111.334C147.41 111.403 147.292 111.473 147.173 111.541C146.915 111.687 146.653 111.832 146.388 111.974C146.316 112.012 146.243 112.047 146.171 112.085C145.978 112.186 145.783 112.287 145.586 112.386C145.459 112.449 145.331 112.511 145.203 112.573C145.048 112.649 144.891 112.723 144.733 112.797C144.614 112.853 144.494 112.909 144.373 112.964C144.198 113.044 144.021 113.122 143.843 113.2C143.722 113.253 143.6 113.306 143.478 113.358C143.288 113.439 143.096 113.519 142.903 113.598C142.836 113.625 142.769 113.655 142.701 113.683C142.662 113.698 142.622 113.712 142.583 113.728C142.371 113.812 142.156 113.895 141.94 113.978C141.847 114.013 141.753 114.051 141.658 114.086C140.71 114.441 139.731 114.771 138.725 115.078C138.613 115.112 138.502 115.145 138.39 115.179C138.257 115.218 138.123 115.26 137.989 115.299C137.911 115.322 137.831 115.343 137.752 115.365C137.61 115.406 137.467 115.446 137.324 115.485C137.095 115.549 136.863 115.611 136.63 115.672C136.52 115.701 136.41 115.73 136.3 115.759C136.064 115.819 135.827 115.879 135.588 115.938C135.451 115.971 135.314 116.004 135.177 116.037C134.975 116.085 134.772 116.131 134.568 116.178C134.312 116.236 134.054 116.294 133.795 116.35C133.535 116.406 133.274 116.461 133.011 116.515C132.85 116.547 132.688 116.578 132.525 116.61C132.333 116.648 132.14 116.686 131.946 116.723C131.689 116.771 131.43 116.818 131.17 116.864C131.075 116.881 130.979 116.898 130.884 116.914C130.595 116.964 130.304 117.012 130.012 117.06C129.932 117.073 129.851 117.085 129.771 117.098C129.484 117.143 129.196 117.188 128.906 117.23C128.818 117.243 128.729 117.256 128.641 117.269C127.33 117.457 125.983 117.62 124.601 117.755C124.468 117.768 124.336 117.782 124.203 117.794C123.92 117.82 123.636 117.845 123.351 117.869C123.24 117.878 123.13 117.888 123.02 117.897C122.701 117.923 122.381 117.948 122.059 117.971C121.967 117.977 121.874 117.984 121.782 117.99C121.463 118.012 121.143 118.033 120.82 118.053C120.73 118.058 120.639 118.063 120.549 118.068C119.546 118.126 118.527 118.171 117.492 118.202C117.322 118.207 117.151 118.213 116.979 118.218C116.785 118.223 116.59 118.225 116.395 118.229C116.147 118.235 115.899 118.24 115.65 118.244C115.415 118.248 115.178 118.25 114.94 118.252C114.688 118.254 114.435 118.256 114.181 118.257C114.008 118.257 113.835 118.257 113.662 118.257C113.32 118.256 112.976 118.255 112.631 118.252C112.503 118.251 112.375 118.25 112.247 118.248C111.858 118.243 111.466 118.237 111.073 118.229C110.984 118.227 110.894 118.226 110.804 118.224C107.734 118.154 104.558 117.977 101.289 117.69C96.3593 128.261 90.7082 137.338 84.7832 144.151C78.6204 151.238 71.9357 156.137 65.2471 157.399C60.5179 158.292 56.1975 157.281 52.5381 154.604C48.9431 151.975 46.1246 147.845 44.0479 142.691C40.0321 132.725 38.5457 118.333 40.043 101.281C40.0382 101.279 40.0331 101.277 40.0283 101.274C39.6986 101.121 39.3711 100.965 39.0449 100.811C38.8351 100.711 38.6254 100.612 38.417 100.512C38.0794 100.35 37.7438 100.186 37.4102 100.023C37.2392 99.9399 37.0684 99.8563 36.8984 99.7725C36.5886 99.6196 36.2801 99.4663 35.9736 99.3125C35.7564 99.2034 35.5398 99.0939 35.3242 98.9844C34.9817 98.8104 34.6409 98.636 34.3027 98.4609C34.2424 98.4297 34.1823 98.3975 34.1221 98.3662C19.2858 90.6566 8.70839 81.8767 3.56055 73.3232C3.50461 73.2303 3.44926 73.137 3.39453 73.0439C3.37308 73.0075 3.35134 72.971 3.33008 72.9346C3.19352 72.7003 3.06142 72.4652 2.93262 72.2305C2.19429 70.8865 1.58552 69.5375 1.11816 68.1895C1.10444 68.1499 1.09161 68.1099 1.07813 68.0703C1.04009 67.9586 1.00191 67.847 0.96582 67.7354C0.954674 67.7009 0.943578 67.6663 0.932617 67.6318C0.823298 67.2877 0.723275 66.9435 0.632813 66.5996C-0.103732 63.8123 -0.218301 61.0433 0.402344 58.3643C1.34437 54.2986 3.89972 50.7745 7.875 47.9023C7.90661 47.8794 7.93796 47.8559 7.96973 47.833C8.12646 47.7208 8.2852 47.6092 8.44629 47.499C8.57825 47.4084 8.71216 47.3194 8.84668 47.2305C8.87052 47.2148 8.89404 47.1983 8.91797 47.1826C10.608 46.0723 12.497 45.0908 14.5547 44.2324C14.6355 44.1986 14.7165 44.1643 14.7979 44.1309C14.8508 44.1092 14.9038 44.087 14.957 44.0654L15.25 43.9482C15.3501 43.9084 15.4509 43.8694 15.5518 43.8301C15.6093 43.8078 15.6668 43.7848 15.7246 43.7627C23.7646 40.6682 34.1765 39.3165 45.6846 39.4756C45.8574 39.4779 46.0307 39.4814 46.2041 39.4844C46.4305 39.4884 46.6576 39.4909 46.8848 39.4961C47.3568 39.5065 47.8313 39.5207 48.3076 39.5361C48.4142 39.5397 48.5212 39.5441 48.6279 39.5479C51.1795 39.6366 53.791 39.7967 56.4512 40.0293C63.6811 24.5137 72.1655 12.7934 80.627 6.1709C85.0025 2.74635 89.5085 0.57999 93.9365 0.100586Z`;

export function teardropKs(halfW: number, corner: number) {
  return normalizeOutline(beltShape(halfW, L - 114, L + 26, corner));
}

export function wedgeQs(e: number, t: number) {
  return normalizeOutline(regularRounded(130, 3, [t, e, e], -Math.PI / 2));
}

// sphere/pumpkin: the engine uses spherical rendering/SDF with no 2D entry; a circular outline for registry completeness.
function circleOutline(): string {
  return sampleParametric((t) => [L + Math.cos(t) * L, L + Math.sin(t) * L]);
}

// crystal: no 2D entry; crystalNodes (r=.12 sphere centers) project into a metaball circle union.
function crystalOutline(): string {
  const r = 0.12;
  return metaballUnion(
    crystalNodes().map((n): [number, number, number] => [L + n.x * L, L - n.y * L, r * L]),
  );
}

// starFlower: no 2D entry; the xy boundary points of starFlowerRing closed with Catmull.
function starFlowerOutline(): string {
  return catmullClosed(starFlowerRing().map((p): [number, number] => [L + p.x * L, L - p.y * L]));
}

// 2D outline registry for the 26 shapes (the heart key is heartChubby)
export const OUTLINE_BUILDERS: Record<BodyId, () => PathBuilder | string> = {
  pebble: () => harmonicBlob(108, 0.075, 1.1),
  bean: () => twoLobe(94, 112, 0.34, Math.PI),
  egg: () => eggShape(98, 113, 0.22),
  squircle: () => superellipse(107, 107, 3.2),
  square: () => roundedRect(107, 28),
  tablet: () => tablet(114, 74),
  capsule: () => capsuleV(72, 113),
  cylinder: () => cylinderSide(94, 110, 48),
  hex: () => regularRounded(114, 6, 20, Math.PI / 6),
  gem: () => superellipse(112, 113, 1.5),
  shield: () => shieldShape(98, 108, 30),
  dome: () => domeShape(114, 82, 26),
  arch: () => archShape(76, 113, 42),
  cloud: () =>
    metaballUnion([
      [L - 62, L + 26, 56],
      [L + 62, L + 26, 54],
      [L, L + 34, 62],
      [L - 24, L - 30, 62],
      [L + 38, L - 26, 54],
    ]),
  leaf: () => leafShape(88, 113, 1.5),
  clover: () => clover(38, 58),
  house: () => houseShape(100, 110, 78, 29),
  heartChubby: () => HEART_PATH,
  sparkle: () => SPARKLE_PATH,
  star6: () => STAR6_PATH,
  teardrop: () => beltShape(88, L - 114, L + 26, 48),
  wedge: () => regularRounded(130, 3, [80, 60, 60], -Math.PI / 2),
  starFlower: () => starFlowerOutline(),
  crystal: () => crystalOutline(),
  sphere: () => circleOutline(),
  pumpkin: () => circleOutline(),
};
