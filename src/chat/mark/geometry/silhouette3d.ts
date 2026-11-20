/**
 * 3D silhouette and eye seats — the cc table's 26 entries (sphere/pumpkin special cases below); units = body-local space normalized by L (y up).
 */
import type { BodyId } from "../types";
import { L, resampleBody, resamplePath, sampleParametric, shapeCache } from "./pathUtils";
import { teardropKs, wedgeQs } from "./outline2d";

const TAU = Math.PI * 2;
const FACE_Z = 0.36;
const BACK_Z = 0.22;
const BEVEL_STEPS = 4;
const FLAT_EPS = 1e-12;
const RING_SEGMENTS = 64;
const AXIS_BALLS = 33;
const PACK_RES = 40;
const LOFT_POW = 0.72;
const LOFT_RINGS = 16;
const LOFT_POINTS = 160;
const LOFT_BUCKETS = 180;
const SPAN_BUCKETS = 64;
const SPAN_EPS = 1e-5;

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}
export interface Pt2 {
  x: number;
  y: number;
}
/** [x, y, z, r] (normalized body-local space) */
export type Ball4 = [number, number, number, number];

export interface SolidSilhouette {
  kind: "solid";
  samples: Pt3[];
  balls: Ball4[];
  isLoop: boolean;
  yawPeriod: number | null;
}
export interface ExtrusionSilhouette {
  kind: "extrusion";
  rings: Pt3[][];
  isConvex: boolean;
}
export interface LoftSilhouette {
  kind: "loft";
  rings: Pt3[][];
}
export type Silhouette = SolidSilhouette | ExtrusionSilhouette | LoftSilhouette;

export interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
}

export type Seat =
  | {
      kind: "wrap";
      wrapR: number;
      wrapY0: number;
      wrapY1: number;
      eyeY: number;
      radiusAt?: (y: number) => number;
      puffAt?: (x: number, y: number) => Puff;
    }
  | { kind: "front"; faceZ: number }
  | { kind: "wrapX"; wrapR: number; wrapX0: number; wrapX1: number; radiusAtX: (x: number) => number }
  | { kind: "loft"; surfaceZ: (x: number, y: number) => number }
  | null;

export interface BodyGeom {
  size: number;
  silhouette: Silhouette;
  seat: Seat;
}

// heartChubby loft source outline (160-point literal table, copied verbatim from SRC)
export const HEART_SAMPLES: Pt2[] = [{x:.934475052698969,y:.004363180216799212},
{x:.948891570423846,y:.039714756021395174},
{x:.9608728659762679,y:.07607039935952659},
{x:.9703302557200477,y:.11326502451357987},
{x:.977189539605176,y:.15112675873557632},
{x:.9813908922405818,y:.18947802927479046},
{x:.9828887074578869,y:.2281365499571005},
{x:.9816519990958227,y:.2669163757988432},
{x:.9776625497902636,y:.30562830330137525},
{x:.9709166586711733,y:.3440810419322467},
{x:.9614266573440594,y:.3820827122339433},
{x:.949221424670692,y:.41944230284893746},
{x:.9343467338379507,y:.45597122804302315},
{x:.9168643128164508,y:.49148439126889626},
{x:.8968538338085426,y:.5258027955519334},
{x:.8744135590875667,y:.5587560766363049},
{x:.8496605481016927,y:.5901852347689388},
{x:.8227287687893752,y:.6199442885313702},
{x:.7937617531488526,y:.6478973166280976},
{x:.762905919754175,y:.6739136951531549},
{x:.7303134746505421,y:.6978700569784003},
{x:.6961411032024281,y:.7196491755310737},
{x:.6605596057818293,y:.7391502303914683},
{x:.6237513457393834,y:.7562897143525837},
{x:.5859073404691287,y:.7710015652906158},
{x:.5472248974285161,y:.7832374824769789},
{x:.507904865265839,y:.7929662862613107},
{x:.4681494646643414,y:.8001734773422571},
{x:.4281602030115182,y:.8048604074486263},
{x:.38813613170852307,y:.8070434681543606},
{x:.34827256966973696,y:.8067537475134688},
{x:.3087597745583025,y:.8040363403785654},
{x:.26978201344672026,y:.7989504065912386},
{x:.23151662960878241,y:.7915694823366872},
{x:.19413194481287305,y:.7819778247879767},
{x:.1577852845947917,y:.7702630818507747},
{x:.12262733079593371,y:.7565354795442158},
{x:.08880015313138229,y:.7409422361214794},
{x:.05642586889159421,y:.7236017950683938},
{x:.02561647598492663,y:.704659966051552},
{x:-.0036037810305528913,y:.6895105233164277},
{x:-.03317542334906984,y:.7095400285365243},
{x:-.06438496917371282,y:.7280864309789705},
{x:-.0971349646590295,y:.7450166000084965},
{x:-.13130575647382275,y:.7601465770772312},
{x:-.16677330012669841,y:.7733777436363767},
{x:-.20339569964825052,y:.7845796245158417},
{x:-.24101725346433553,y:.7936313321637897},
{x:-.27947704857143557,y:.8004456020397803},
{x:-.3186049196302664,y:.8049436403918587},
{x:-.35822225014656567,y:.8070572252942809},
{x:-.398143514039767,y:.8067313311007664},
{x:-.438177182680152,y:.8039242993502419},
{x:-.478126841210925,y:.7986084072202804},
{x:-.5177925726656645,y:.7907706714017452},
{x:-.5569723963185897,y:.7804134068929688},
{x:-.5954640748960385,y:.7675550146764192},
{x:-.6330671972405764,y:.7522306880298593},
{x:-.6695855487964426,y:.734492987733704},
{x:-.7048299443180804,y:.714412410733904},
{x:-.7386209319309059,y:.6920772477931056},
{x:-.7707921245520308,y:.6675935661866239},
{x:-.8011924150225685,y:.641083697347949},
{x:-.8296683466506882,y:.612669941116809},
{x:-.8560711521836232,y:.5824818706921402},
{x:-.8802586099360401,y:.550657644865542},
{x:-.9021016261853626,y:.5173474030319016},
{x:-.921488351217944,y:.48271361643050537},
{x:-.9383250626073236,y:.44692900756649523},
{x:-.9525363976829352,y:.4101742582574272},
{x:-.9640652637601566,y:.37263580242597466},
{x:-.9728702117174652,y:.3345029815392968},
{x:-.9789264673905609,y:.2959671170672982},
{x:-.9822255348467005,y:.25722000690078245},
{x:-.982774894246464,y:.21845258628445002},
{x:-.9805967489497907,y:.17985349925722946},
{x:-.9757258679433654,y:.1416078138454962},
{x:-.9682107746348935,y:.1038965717106635},
{x:-.9581143826889033,y:.06689596974801386},
{x:-.9455146116784895,y:.03077634172969411},
{x:-.9305051553319804,y:-.004299067407576291},
{x:-.9131952327192244,y:-.038175545674491246},
{x:-.8937019647378253,y:-.07070785611844921},
{x:-.8721591451869681,y:-.10176130887451734},
{x:-.8487362913086253,y:-.1312168064224554},
{x:-.8236207468105732,y:-.15897343836917888},
{x:-.7970979502287641,y:-.18497038865757742},
{x:-.7710541733734617,y:-.2096139557882936},
{x:-.7461193861529073,y:-.23320814197562353},
{x:-.7221519248227056,y:-.2558870618710858},
{x:-.6990265515010246,y:-.27776911859221876},
{x:-.6766318459161248,y:-.29895980890191903},
{x:-.6548676461286994,y:-.31955389248594185},
{x:-.6336431338424889,y:-.3396372581810514},
{x:-.6128753135059731,y:-.359288557412959},
{x:-.5924873537443393,y:-.3785803988633805},
{x:-.5724075923763201,y:-.3975806113171165},
{x:-.5525683653066091,y:-.4163531831687479},
{x:-.5329051623123328,y:-.43495923867716463},
{x:-.5133556323648999,y:-.45345775659418885},
{x:-.49385881021048816,y:-.47190633957419137},
{x:-.4743544952965227,y:-.4903620705111528},
{x:-.4547822689301765,y:-.5088820023697915},
{x:-.43508096787875605,y:-.5275240823754965},
{x:-.41518776564532156,y:-.5463477370262614},
{x:-.39503744073179237,y:-.565414738403984},
{x:-.37456138068841166,y:-.584789881188713},
{x:-.3536868090571391,y:-.6045421927475639},
{x:-.33233545822868515,y:-.6247456276706727},
{x:-.31042247776931897,y:-.6454805113116225},
{x:-.28785488995869934,y:-.6668347728530055},
{x:-.26452992996104363,y:-.6889057008744045},
{x:-.24032737271767535,y:-.7117848186103969},
{x:-.21465925160321186,y:-.7340046463187382},
{x:-.18703495679704094,y:-.7534714425430167},
{x:-.15772553428835867,y:-.7700652053068575},
{x:-.1270070450444056,y:-.7836711911119708},
{x:-.0951684130469074,y:-.7942311382405959},
{x:-.062495032850901626,y:-.8016579582061256},
{x:-.02928242470209217,y:-.8059763869703366},
{x:.00418250025635626,y:-.8071603933705995},
{x:.03761179305139532,y:-.8051997052887491},
{x:.07071763099568142,y:-.8001090083866196},
{x:.10320959245128111,y:-.7918885098432591},
{x:.134798677354145,y:-.7805799374564395},
{x:.16519657722647352,y:-.7662371932046725},
{x:.1941137081486192,y:-.748919054724023},
{x:.22126182274327255,y:-.7287044591356419},
{x:.24646172395988103,y:-.705992917688509},
{x:.27042811605651085,y:-.6833113574191189},
{x:.2935522498121435,y:-.6614269249128338},
{x:.31594558408750634,y:-.6402340573221494},
{x:.33770831010282365,y:-.6196380408622824},
{x:.3589311734375708,y:-.5995528607013482},
{x:.3796973337781967,y:-.579900027393222},
{x:.40008347985475634,y:-.5606067493570983},
{x:.4201613352275292,y:-.5416052696177914},
{x:.4399985323371352,y:-.5228315569692281},
{x:.4596595725296922,y:-.504224454308306},
{x:.47920690986264164,y:-.4857251046289992},
{x:.4987013585100146,y:-.46727574968264535},
{x:.5182031792984406,y:-.44881937116377135},
{x:.5377727619439542,y:-.4302988919363394},
{x:.5574712942997964,y:-.41165639717445024},
{x:.5773615598171413,y:-.39283243400856016},
{x:.5975088031531646,y:-.3737652763272414},
{x:.6179815681468954,y:-.3543900575947271},
{x:.6388526754619042,y:-.3346378544777047},
{x:.6602003073706015,y:-.3144346462096216},
{x:.6821093031111911,y:-.2937001458611249},
{x:.7046726622334125,y:-.2723464324690267},
{x:.7279930725720649,y:-.25027624068777876},
{x:.752199978996238,y:-.22738555814564856},
{x:.7774207173704459,y:-.20355017023582161},
{x:.8037647094696927,y:-.17862206250636986},
{x:.8300422031017065,y:-.15219910918500412},
{x:.8547554784773178,y:-.1240094996536292},
{x:.8777124848745345,y:-.09414272665900433},
{x:.8987592287763329,y:-.06270816362882596},
{x:.9177264967761565,y:-.029827205842901418}];

export function samplesFromOutline(pts: readonly (readonly [number, number])[]): Pt3[] {
  return pts.map(([x, y]) => ({ x: (x - L) / L, y: -(y - L) / L, z: 0 }));
}

export function outlineBounds(body: BodyId): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = 1 / 0, x1 = -1 / 0, y0 = 1 / 0, y1 = -1 / 0;
  for (const [x, y] of shapeCache(body).ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

export function beveledOutlineSamples(body: BodyId, faceZ: number, backZ: number): Pt3[] {
  const ring = shapeCache(body).ring.map(([x, y]) => ({ x: (x - L) / L, y: -(y - L) / L }));
  const n = ring.length;
  const out: Pt3[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const prev = ring[(i - 1 + n) % n]!;
    const next = ring[(i + 1) % n]!;
    let nx = next.y - prev.y, ny = -(next.x - prev.x);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if (nx * p.x + ny * p.y < 0) {
      nx = -nx; ny = -ny;
    }
    for (let s = 0; s <= BEVEL_STEPS; s++) {
      const a = (s / BEVEL_STEPS) * (Math.PI / 2);
      const inset = backZ * (1 - Math.cos(a));
      const z = faceZ - backZ + backZ * Math.sin(a);
      out.push({ x: p.x - nx * inset, y: p.y - ny * inset, z });
      out.push({ x: p.x - nx * inset, y: p.y - ny * inset, z: -z });
    }
  }
  return out;
}

export function crystalNodes(): Pt3[] {
  const nodes: Pt3[] = [
    { x: 0, y: 1.04, z: 0 },
    { x: 0, y: -1.04, z: 0 },
  ];
  const ring = 0.52;
  for (const half of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      nodes.push({ x: ring * Math.cos(a), y: half * 0.51, z: ring * Math.sin(a) });
    }
  }
  return nodes;
}

export function crystalSamples(): Pt3[] {
  const e = 0.12;
  const out: Pt3[] = [];
  for (const node of crystalNodes()) {
    for (let t = 0; t <= 8; t++) {
      const i = (t / 8) * Math.PI;
      const a = Math.sin(i);
      const o = t === 0 || t === 8 ? 1 : 14;
      for (let s = 0; s < o; s++) {
        const ang = (s / o) * TAU;
        out.push({ x: node.x + e * a * Math.sin(ang), y: node.y + e * Math.cos(i), z: node.z + e * a * Math.cos(ang) });
      }
    }
  }
  return out;
}

export function spanQuery(pts: readonly (readonly [number, number])[]): (y: number) => number {
  const n = pts.length;
  let minY = 1 / 0, maxY = -1 / 0;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  minY -= SPAN_EPS;
  maxY += SPAN_EPS;
  const bucketOf = (y: number): number => Math.min(63, Math.floor(((y - minY) / (maxY - minY)) * SPAN_BUCKETS));
  const buckets: number[][] = Array.from({ length: SPAN_BUCKETS }, () => []);
  for (let i = 0; i < n; i++) {
    const y0 = pts[i]![1]!, y1 = pts[(i + 1) % n]![1]!;
    const hi = bucketOf(Math.max(y0, y1) + SPAN_EPS);
    for (let b = bucketOf(Math.min(y0, y1) - SPAN_EPS); b <= hi; b++) buckets[b]!.push(i);
  }
  return (y: number): number => {
    let lo = 1 / 0, hi = -1 / 0;
    if (!(y >= minY && y <= maxY)) return hi - lo;
    for (const i of buckets[bucketOf(y)]!) {
      const [x0, ya] = pts[i]!;
      const [x1, yb] = pts[(i + 1) % n]!;
      if (Math.abs(yb - ya) < 1e-9) {
        if (Math.abs(ya - y) < 1e-6) {
          lo = Math.min(lo, x0, x1);
          hi = Math.max(hi, x0, x1);
        }
      } else if ((ya <= y && yb >= y) || (yb <= y && ya >= y)) {
        const x = x0 + ((x1 - x0) * (y - ya)) / (yb - ya);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    return hi - lo;
  };
}

export function latitudeRing(y: number, r: number): Pt3[] {
  const ring: Pt3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * TAU;
    ring.push({ x: r * Math.sin(a), y, z: r * Math.cos(a) });
  }
  return ring;
}

// Solid-of-revolution samples: 95+2 latitude rings, ends closed with √(r·dJoin)
export function revolveOutline(pts: readonly (readonly [number, number])[]): Pt3[] {
  let minY = 1 / 0, maxY = -1 / 0;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const out: Pt3[] = [];
  const topY = -(minY - L) / L;
  const botY = -(maxY - L) / L;
  const widthAt = spanQuery(pts);
  const halfW = (y: number): number => {
    const w = widthAt(y);
    return w < 0 ? 0 : w / 2 / L;
  };
  const height = maxY - minY;
  const edgeJoin = (y: number, sign: number): { yEdge: number; sign: number; dJoin: number; rJoin: number } | null => {
    if (halfW(y) >= 0.06) return null;
    const base = halfW(y);
    let dJoin = height * 0.02;
    for (let i = height / 512; i <= height * 0.05; i += height / 512) {
      if (Math.abs(halfW(y + sign * i) - base) > 1e-4) {
        dJoin = i;
        break;
      }
    }
    return { yEdge: y, sign, dJoin, rJoin: halfW(y + sign * dJoin) };
  };
  const joins = [edgeJoin(minY, 1), edgeJoin(maxY, -1)].filter((j): j is NonNullable<typeof j> => j !== null);
  const capped = (y: number): number => {
    let r = halfW(y);
    for (const j of joins) {
      const d = (y - j.yEdge) * j.sign;
      if (d >= 0 && d < j.dJoin) r = Math.min(r, j.rJoin * Math.sqrt(d / j.dJoin));
    }
    return r;
  };
  const pushRing = (yNorm: number, yRaw: number): void => {
    const r = capped(yRaw);
    if (r < 0.06) out.push({ x: 0, y: yNorm, z: 0 });
    else out.push(...latitudeRing(yNorm, r));
  };
  pushRing(topY, minY);
  for (let i = 1; i < 95; i++) {
    const ease = (1 - Math.cos((i / 95) * Math.PI)) / 2;
    const yRaw = minY + (maxY - minY) * ease;
    const r = capped(yRaw);
    const yNorm = -(yRaw - L) / L;
    if (r < 1e-4) out.push({ x: 0, y: yNorm, z: 0 });
    else out.push(...latitudeRing(yNorm, r));
  }
  pushRing(botY, maxY);
  return out;
}

export function revolveOutlineById(body: BodyId): Pt3[] {
  return revolveOutline(resampleBody(body));
}

export function spanRadiusAt(pts: readonly (readonly [number, number])[]): (yNorm: number) => number {
  const widthAt = spanQuery(pts);
  let minY = 1 / 0, maxY = -1 / 0;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (yNorm: number): number => {
    const y = Math.max(minY, Math.min(maxY, L - yNorm * L));
    return Math.max(0.02, widthAt(y) / 2 / L);
  };
}

export function spanRadiusById(body: BodyId): (yNorm: number) => number {
  return spanRadiusAt(resampleBody(body));
}

export function ballsFromAxis(body: BodyId, axis: "x" | "y"): Ball4[] {
  const { x0, x1, y0, y1 } = outlineBounds(body);
  const hx = (x1 - x0) / 2 / L;
  const hy = (y1 - y0) / 2 / L;
  const r = axis === `x` ? hy : hx;
  const halfLen = Math.max(0, (axis === `x` ? hx : hy) - r);
  const lo = -halfLen;
  const balls: Ball4[] = [];
  for (let i = 0; i < AXIS_BALLS; i++) {
    const t = lo + (halfLen - lo) * (i / 32);
    balls.push(axis === `x` ? [t, 0, 0, r] : [0, t, 0, r]);
  }
  return balls;
}

export function ballsBounds(balls: readonly Ball4[]): { hx: number; hz: number } {
  let hx = 0.55, hz = 0.35;
  for (const [x, , z, r] of balls) {
    hx = Math.max(hx, Math.abs(x) + r);
    hz = Math.max(hz, Math.abs(z) + r);
  }
  return { hx, hz };
}

export function inscribedBalls(body: BodyId): Ball4[] {
  const pts = resampleBody(body);
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const inside = (x: number, y: number): boolean => {
    let hit = false;
    const n = pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > y !== yj > y && x < xi + ((xj - xi) * (y - yi)) / (yj - yi)) hit = !hit;
    }
    return hit;
  };
  const step = Math.max(maxX - minX, maxY - minY) / PACK_RES;
  const cands: { x: number; y: number; r: number }[] = [];
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      if (!inside(x, y)) continue;
      let d2 = 1 / 0;
      for (const [px, py] of pts) d2 = Math.min(d2, (px - x) ** 2 + (py - y) ** 2);
      const r = Math.sqrt(d2);
      if (r > step) cands.push({ x, y, r });
    }
  }
  cands.sort((a, b) => b.r - a.r);
  const kept: { x: number; y: number; r: number }[] = [];
  for (const c of cands) {
    if (!kept.some((k) => Math.hypot(c.x - k.x, c.y - k.y) + c.r <= k.r + step * 0.25)) kept.push(c);
  }
  return kept.map((c): Ball4 => [(c.x - L) / L, -(c.y - L) / L, 0, c.r / L]);
}

export function bevelRings(samples: readonly Pt3[], faceZ: number, backZ: number): Pt3[][] {
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(1e-4, Math.min((maxX - minX) / 2, (maxY - minY) / 2));
  const ringAt = (step: number, side: number): { z: number; scale: number } => {
    const a = (step / BEVEL_STEPS) * (Math.PI / 2);
    const z = faceZ - backZ + backZ * Math.sin(a);
    return { z: side < 0 ? -z : z, scale: 1 - (backZ / half) * (1 - Math.cos(a)) };
  };
  const rings: { z: number; scale: number }[] = [];
  for (let s = BEVEL_STEPS; s >= 0; s--) rings.push(ringAt(s, -1));
  for (let s = 0; s <= BEVEL_STEPS; s++) rings.push(ringAt(s, 1));
  return rings.map(({ z, scale }) =>
    samples.map((p) => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale, z })),
  );
}

export function isConvexOutline(samples: readonly Pt3[]): boolean {
  let sign = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i]!;
    const b = samples[(i + 1) % samples.length]!;
    const c = samples[(i + 2) % samples.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (!(Math.abs(cross) < FLAT_EPS)) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

export function starFlowerRing(): Pt3[] {
  const armR = 0.58;
  const circles: { x: number; y: number; r: number }[] = [{ x: 0, y: 0, r: 0.36 }];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    circles.push({ x: armR * Math.cos(a), y: armR * Math.sin(a), r: 0.33 });
  }
  const out: Pt3[] = [];
  for (let i = 0; i < 240; i++) {
    const ang = (i / 240) * TAU;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let lo = 0, hi = 0.9099999999999999;
    for (let s = 0; s < 22; s++) {
      const mid = (lo + hi) / 2;
      const px = mid * cx, py = mid * cy;
      if (circles.some((c) => (px - c.x) * (px - c.x) + (py - c.y) * (py - c.y) <= c.r * c.r)) lo = mid;
      else hi = mid;
    }
    out.push({ x: lo * cx, y: lo * cy, z: 0 });
  }
  return out;
}

export function loftRings(samples: readonly Pt2[], depth: number): { rings: Pt3[][]; center: Pt2; depth: number } {
  const stride = samples.length / LOFT_POINTS;
  const base =
    stride > 1
      ? Array.from({ length: LOFT_POINTS }, (_t, i) => samples[Math.floor(i * stride)]!)
      : (samples as readonly Pt2[]);
  let minX = 1 / 0, maxX = -1 / 0, minY = 1 / 0, maxY = -1 / 0;
  for (const p of base) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const rings: Pt3[][] = [];
  for (let i = 0; i <= LOFT_RINGS; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / LOFT_RINGS;
    const shrink = Math.max(0, Math.cos(lat)) ** +LOFT_POW;
    const z = depth * Math.sin(lat);
    rings.push(base.map((p) => ({ x: center.x + (p.x - center.x) * shrink, y: center.y + (p.y - center.y) * shrink, z })));
  }
  return { rings, center, depth };
}

export function loftSurfaceZ(loft: { rings: Pt3[][]; center: Pt2; depth: number }): (x: number, y: number) => number {
  const { rings, center, depth } = loft;
  const mid = rings[Math.floor(rings.length / 2)]!;
  const dist = new Float64Array(LOFT_BUCKETS);
  for (let i = 0; i < LOFT_BUCKETS; i++) {
    const ang = ((i + 0.5) / LOFT_BUCKETS) * Math.PI * 2;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let best = 0;
    for (let j = 0; j < mid.length; j++) {
      const a = mid[j]!;
      const b = mid[(j + 1) % mid.length]!;
      const ex = b.x - a.x, ey = b.y - a.y;
      const den = cx * ey - cy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const dx = a.x - center.x, dy = a.y - center.y;
      const t = (dx * ey - dy * ex) / den;
      const u = (dx * cy - dy * cx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    dist[i] = best;
  }
  const ratio = (x: number, y: number): number => {
    const dx = x - center.x, dy = y - center.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-8) return 0;
    const s = (((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * LOFT_BUCKETS;
    const i0 = Math.floor(s) % LOFT_BUCKETS;
    const f = s - Math.floor(s);
    const r0 = dist[i0]!, r1 = dist[(i0 + 1) % LOFT_BUCKETS]!;
    return Math.min(1, r / Math.max(1e-8, r0 * (1 - f) + r1 * f));
  };
  return (x: number, y: number): number => depth * Math.sqrt(Math.max(0, 1 - ratio(x, y) ** (2 / LOFT_POW)));
}

export function puffAt(balls: readonly Ball4[], x: number, y: number): Puff {
  let best = balls[0]!;
  let bestZ = -1 / 0;
  let nearGap = 1 / 0;
  let hit = false;
  for (const b of balls) {
    const d = Math.hypot(x - b[0], y - b[1]);
    if (d < b[3]) {
      const z = b[2] + Math.sqrt(b[3] * b[3] - d * d);
      if (!hit || z > bestZ) {
        hit = true;
        bestZ = z;
        best = b;
      }
    } else if (!hit && d - b[3] < nearGap) {
      nearGap = d - b[3];
      best = b;
    }
  }
  return { x: best[0], y: best[1], z: best[2], r: best[3] };
}

export function solidFromSamples(samples: Pt3[]): SolidSilhouette {
  return { kind: `solid`, samples, balls: [], isLoop: false, yawPeriod: null };
}

export function solidRevolution(samples: Pt3[]): SolidSilhouette {
  return { kind: `solid`, samples, balls: [], isLoop: false, yawPeriod: 360 / RING_SEGMENTS };
}

export function extrusionBeveled(size: number, samples: Pt3[], faceZ: number, backZ: number): BodyGeom {
  return {
    size,
    silhouette: { kind: `extrusion`, rings: bevelRings(samples, faceZ, backZ), isConvex: isConvexOutline(samples) },
    seat: { kind: `front`, faceZ },
  };
}

export function extrusion(size: number, samples: Pt3[]): BodyGeom {
  return extrusionBeveled(size, samples, FACE_Z, BACK_Z);
}

export function loft(size: number, samples: Pt2[], depth: number): BodyGeom {
  const built = loftRings(samples, depth);
  return {
    size,
    silhouette: { kind: `loft`, rings: built.rings },
    seat: { kind: `loft`, surfaceZ: loftSurfaceZ(built) },
  };
}

export function wrapSeat(body: BodyId, balls: readonly Ball4[]): Extract<Seat, { kind: "wrap" }> {
  const outline = shapeCache(body);
  const wrapY0 = -(outline.bottom - L) / L;
  const wrapY1 = -(outline.top - L) / L;
  const radiusAt = spanRadiusById(body);
  const eyeY = Math.min(wrapY1 - 0.02, Math.max(wrapY0 + 0.02, 0));
  return {
    kind: `wrap`,
    wrapR: radiusAt(eyeY),
    wrapY0,
    wrapY1,
    eyeY,
    radiusAt,
    puffAt: balls.length > 0 ? (x: number, y: number): Puff => puffAt(balls, x, y) : undefined,
  };
}

// belt radius wrap (cylinder/arch etc., size fixed at 1.17); wrapY0=bottom-derived (small value), wrapY1=top-derived (large value), eyeY argument order (top-derived, bottom-derived).
export function withBelt(body: BodyId, eyeYAt: (y0: number, y1: number) => number): BodyGeom {
  const outline = shapeCache(body);
  const r = -(outline.top - L) / L;
  const i = -(outline.bottom - L) / L;
  return {
    size: 1.17,
    silhouette: solidRevolution(revolveOutlineById(body)),
    seat: {
      kind: `wrap`,
      wrapR: outline.beltRadius / L,
      wrapY0: i,
      wrapY1: r,
      eyeY: eyeYAt(r, i),
      radiusAt: spanRadiusById(body),
    },
  };
}

export function revolveSolid(size: number, body: BodyId): BodyGeom {
  return { size, silhouette: solidRevolution(revolveOutlineById(body)), seat: wrapSeat(body, []) };
}

let unitSilhouette: BodyGeom | null = null;
export function UNIT_SILHOUETTE(): BodyGeom {
  return (unitSilhouette ??= {
    size: 1.17,
    silhouette: { kind: `solid`, samples: samplesFromOutline(resampleBody(`bean`)), balls: [], isLoop: true, yawPeriod: null },
    seat: null,
  });
}

// sphere: the engine uses dedicated spherical rendering (no cc entry); a radius-1 solid-of-revolution equivalent for registry completeness (reused by the pumpkin stub).
function sphereGeom(): BodyGeom {
  const circle = sampleParametric((t): [number, number] => [L + Math.cos(t) * L, L + Math.sin(t) * L]);
  return { size: 1, silhouette: solidRevolution(revolveOutline(resamplePath(circle))), seat: null };
}

/** §0.4 scope trim: pumpkin's SDF field is not ported; body resolution short-circuits on this constant. */
export const PUMPKIN_DISABLED = true;

// 26-body silhouette table (size literals copied verbatim)
export const SILHOUETTES: Record<BodyId, () => BodyGeom> = {
  pebble: () => revolveSolid(1.2167999999999999, `pebble`),
  bean: () => {
    const balls = inscribedBalls(`bean`);
    return {
      size: 1.17,
      silhouette: { kind: `solid`, samples: [], balls, isLoop: false, yawPeriod: null },
      seat: wrapSeat(`bean`, balls),
    };
  },
  egg: () => revolveSolid(1.17, `egg`),
  squircle: () => ({
    size: 1.17,
    silhouette: solidFromSamples(beveledOutlineSamples(`squircle`, 0.28, 0.11)),
    seat: { kind: `front`, faceZ: 0.28 },
  }),
  tablet: () => {
    const { x0, x1, y0, y1 } = outlineBounds(`tablet`);
    const hx = (x1 - x0) / 2 / L;
    const hy = (y1 - y0) / 2 / L;
    const flat = Math.max(0, hx - hy);
    return {
      size: 1.3922999999999999,
      silhouette: { kind: `solid`, samples: [], balls: ballsFromAxis(`tablet`, `x`), isLoop: false, yawPeriod: null },
      seat: {
        kind: `wrapX`,
        wrapR: hy,
        wrapX0: -hx + 0.02,
        wrapX1: hx - 0.02,
        radiusAtX: (x: number): number => {
          const d = Math.abs(x) - flat;
          return d <= 0 ? hy : Math.sqrt(Math.max(0, hy * hy - d * d));
        },
      },
    };
  },
  capsule: () => {
    const balls = ballsFromAxis(`capsule`, `y`);
    const { y0, y1 } = outlineBounds(`capsule`);
    const wrapY0 = -(y1 - L) / L;
    const wrapY1 = -(y0 - L) / L;
    const { hx, hz } = ballsBounds(balls);
    return {
      size: 1.17,
      silhouette: { kind: `solid`, samples: [], balls, isLoop: false, yawPeriod: null },
      seat: {
        kind: `wrap`,
        wrapR: Math.max(0.35, (hx + hz) * 0.5),
        wrapY0,
        wrapY1,
        eyeY: (wrapY0 + wrapY1) * 0.5,
      },
    };
  },
  cylinder: () => withBelt(`cylinder`, (y0, y1) => (y1 + y0) * 0.5),
  hex: () => extrusion(1.2519, samplesFromOutline(resampleBody(`hex`))),
  gem: () => revolveSolid(1.17, `gem`),
  crystal: () => ({
    size: 1.3805999999999998,
    silhouette: solidFromSamples(crystalSamples()),
    seat: { kind: `front`, faceZ: (Math.sqrt(3) / 2) * 0.64 },
  }),
  wedge: () => {
    const outline = wedgeQs(60, 80);
    const pts = resamplePath(outline.path);
    const [lo, hi] = outline.spanAt(outline.top + (outline.bottom - outline.top) * 0.5);
    const wrapY1 = -(outline.top - L) / L;
    const wrapY0 = -(outline.bottom - L) / L;
    return {
      size: 1.3590719999999998,
      silhouette: solidRevolution(revolveOutline(pts)),
      seat: {
        kind: `wrap`,
        wrapR: Math.max(0.2, (hi - lo) / 2 / L),
        wrapY0,
        wrapY1,
        eyeY: wrapY1 + (wrapY0 - wrapY1) * 0.5,
        radiusAt: spanRadiusAt(pts),
      },
    };
  },
  shield: () => revolveSolid(1.17, `shield`),
  dome: () => revolveSolid(1.17, `dome`),
  arch: () => withBelt(`arch`, (y0, y1) => y0 + (y1 - y0) * 0.42),
  cloud: () => loft(1.3455, samplesFromOutline(resampleBody(`cloud`, 1)), 0.72),
  teardrop: () => {
    const outline = teardropKs(88, 48);
    const pts = resamplePath(outline.path);
    const [lo, hi] = outline.spanAt(outline.top + (outline.bottom - outline.top) * 0.62);
    const wrapY0 = -(outline.bottom - L) / L;
    const wrapY1 = -(outline.top - L) / L;
    return {
      size: 1.318122,
      silhouette: solidRevolution(revolveOutline(pts)),
      seat: {
        kind: `wrap`,
        wrapR: Math.max(0.2, (hi - lo) / 2 / L),
        wrapY0,
        wrapY1,
        eyeY: (wrapY0 + wrapY1) * 0.5,
        radiusAt: spanRadiusAt(pts),
      },
    };
  },
  leaf: () => revolveSolid(1.17, `leaf`),
  square: () => extrusion(1.0413, samplesFromOutline(resampleBody(`square`))),
  starFlower: () => extrusion(1.3922999999999999, starFlowerRing()),
  sparkle: () => extrusion(1.521, samplesFromOutline(resampleBody(`sparkle`))),
  clover: () => extrusion(1.0881, samplesFromOutline(resampleBody(`clover`))),
  heartChubby: () => loft(1.3571999999999997, HEART_SAMPLES, 0.62),
  house: () => extrusion(1.17, samplesFromOutline(resampleBody(`house`))),
  star6: () => extrusionBeveled(1.4976, samplesFromOutline(resampleBody(`star6`)), 0.3, 0.18),
  sphere: () => sphereGeom(),
  // §0.4 trim: pumpkin → sphere stub (equivalent solid)
  pumpkin: () => sphereGeom(),
};

const silhouetteCache = new Map<BodyId, BodyGeom>();
export function getSilhouette(body: BodyId): BodyGeom {
  const hit = silhouetteCache.get(body);
  if (hit != null) return hit;
  const geom = SILHOUETTES[body]();
  silhouetteCache.set(body, geom);
  return geom;
}
