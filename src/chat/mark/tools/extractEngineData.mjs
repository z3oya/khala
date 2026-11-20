#!/usr/bin/env node
/**
 * A1 data extraction (PORTING §2 data table / §3 assertion baselines).
 *
 * Slices engine data segments out of the single-line minified Grok Bot 0.79.3 bundle by string anchors,
 * evaluates them (pure literal segments), asserts substring presence for the function-dependent tables (gi/Hs/cc) and constants,
 * then generates the 5 .generated.ts files under src/chat/mark/data/.
 *
 * Usage: node src/chat/mark/tools/extractEngineData.mjs
 * SRC is read-only; any assertion failure exits with code 1.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DATA_DIR = join(REPO, "src", "chat", "mark", "data");
const ASSETS_DIR = "C:/Users/Q/UserSpace/01.Lab/khala/.tmp-grokbot/unpacked/dist/renderer/assets";

// ── Locate SRC (readdir + regex, working around sporadic Windows path issues) ─────────────
const srcFile = readdirSync(ASSETS_DIR).find((f) => /^index\.eager-common-[A-Za-z0-9_-]+\.js$/.test(f));
if (!srcFile) throw new Error(`no index.eager-common-*.js in ${ASSETS_DIR}`);
const srcBytes = readFileSync(join(ASSETS_DIR, srcFile));
const src = srcBytes.toString("utf8");
const sha256 = createHash("sha256").update(srcBytes).digest("hex");
const today = new Date().toISOString().slice(0, 10);

// ── Assertion registry ────────────────────────────────
const results = [];
const discrepancies = [];
const check = (group, name, pass, detail = "") => {
  results.push({ group, name, pass, detail });
  if (!pass) console.error(`FAIL [${group}] ${name}${detail ? " — " + detail : ""}`);
};

// ── Bracket-aware scanner ──────────────────────────────
function scanString(srcText, i) {
  const q = srcText[i];
  i += 1;
  while (i < srcText.length) {
    const c = srcText[i];
    if (c === "\\") { i += 2; continue; }
    if (q === "`" && c === "$" && srcText[i + 1] === "{") {
      throw new Error(`template interpolation at ${i} — data segments must not contain \${`);
    }
    if (c === q) return i + 1;
    i += 1;
  }
  throw new Error("unterminated string");
}

function scanBracket(srcText, i) {
  const open = srcText[i];
  const close = { "(": ")", "[": "]", "{": "}" }[open];
  let depth = 0;
  while (i < srcText.length) {
    const c = srcText[i];
    if (c === "'" || c === '"' || c === "`") { i = scanString(srcText, i); continue; }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) {
        if (c !== close) throw new Error(`bracket mismatch at ${i}`);
        return i + 1;
      }
    }
    i += 1;
  }
  throw new Error("unbalanced brackets");
}

/** Read one full expression from start (opening bracket/backtick/`new X(`), including the trailing member call chain. */
function readExpr(srcText, start) {
  let i = start;
  const newM = /^new\s+/.exec(srcText.slice(i, i + 8));
  if (newM) i += newM[0].length;
  const idM = /^[A-Za-z_$][\w$]*/.exec(srcText.slice(i));
  if (idM) i += idM[0].length;
  for (;;) {
    const c = srcText[i];
    if (c === "(" || c === "[" || c === "{") { i = scanBracket(srcText, i); continue; }
    if (c === "`") { i = scanString(srcText, i); continue; }
    if (c === ".") {
      const mM = /^\.[A-Za-z_$][\w$]*/.exec(srcText.slice(i));
      if (mM) { i += mM[0].length; continue; }
    }
    break;
  }
  if (i === start) throw new Error(`empty expression at ${start}`);
  return { text: srcText.slice(start, i), end: i };
}

/** Anchor slicing: anchor locates uniquely, exprOffset points at the expression's first char; expectAfter checks the closing boundary. */
function cutExpr(name, anchor, exprOffset, expectAfter) {
  const a = src.indexOf(anchor);
  if (a < 0) throw new Error(`anchor not found: ${anchor}`);
  const { text, end } = readExpr(src, a + exprOffset);
  if (expectAfter !== undefined && !src.startsWith(expectAfter, end)) {
    throw new Error(
      `${name}: expected closing ${JSON.stringify(expectAfter)}, got ${JSON.stringify(src.slice(end, end + 24))}`,
    );
  }
  const sep = src[end];
  if (sep !== "," && sep !== ";" && sep !== ")" && sep !== undefined) {
    throw new Error(`${name}: illegal separator after expression ${JSON.stringify(sep)}`);
  }
  return { text, end };
}

function evaluate(name, text, bindings = {}) {
  const keys = Object.keys(bindings);
  try {
    const fn = new Function(...keys, `return (${text})`);
    return fn(...keys.map((k) => bindings[k]));
  } catch (err) {
    throw new Error(`evaluation failed for ${name}: ${err.message}\nsegment: ${text.slice(0, 120)}…`);
  }
}

// ── Slice and evaluate each data segment ──────────────
const seg = {};
const defs = [
  ["oo", "var oo=", 7, ",so=120"],
  ["co", ",so=120,co=", 11, ",lo="],
  ["lo", ",lo={idle:", 4, ",uo=new Map"],
  ["qr", "qr=[{A:[", 3, ";"],
  ["rn", "rn=[{id:`black`", 3, ";"],
  ["sn", "sn=[{label:`Lifecycle`", 3, ",cn=[`blob`"],
  ["cn", "cn=[`blob`", 3, ",ln=[{shape:"],
  ["ln", "ln=[{shape:`pumpkin`", 3, ";[...cn]"],
  ["un", "var un=[", 7, ",dn=new Set("],
  ["dn", ",dn=new Set(", 4, ",fn=["],
  ["fn", ",fn=[`blob`", 4, ",pn=["],
  ["pn", ",pn=[`blob`", 4, ",mn=5"],
  ["lr", "var lr={black:", 7, ";"],
  ["dr", "var dr={black:", 7, ";"],
  ["Oo", "Oo={cloud:{", 3, ";function ko("],
  ["ei", "ei=`sphere", 3, ",ti=new Set("],
  ["ni", "ni=[`neutral`", 3, ",ri=.26"],
  ["ai", "ai=new Map([[`thinking`", 3, undefined],
  ["oi", "oi=new Set([`sad`", 3, ";"],
];
for (const [name, anchor, off, after] of defs) seg[name] = cutExpr(name, anchor, off, after);

const clips = evaluate("oo", seg.oo.text);
const workingClips = evaluate("co", seg.co.text);
// lo references identifiers from the same chain: reading/working/coding/running/computing/controlling directly alias the co object,
// blocked.holdSeconds references constant so (=120; the slice-boundary assertion confirms `,so=120,`). Both bindings are injected for evaluation,
// and the generated data is expanded to runtime values (the 6 working-family entries each hold a copy of the clips list, holdSeconds=120).
const lo = evaluate("lo", seg.lo.text, { co: workingClips, so: 120 });
const qr = evaluate("qr", seg.qr.text);
const palette = evaluate("rn", seg.rn.text);
const states = evaluate("sn", seg.sn.text);
const pickerShapes = evaluate("cn", seg.cn.text);
const seasonalShapes = evaluate("ln", seg.ln.text);
const allShapeIds = evaluate("un", seg.un.text, { cn: pickerShapes, ln: seasonalShapes });
const shapeIdSet = evaluate("dn", seg.dn.text, { un: allShapeIds });
const defaultShapeSet = evaluate("fn", seg.fn.text);
const menubarShapeSet = evaluate("pn", seg.pn.text);
const gradientPairs = evaluate("lr", seg.lr.text);
const flatColors = evaluate("dr", seg.dr.text);
const staticEyeSeats = evaluate("Oo", seg.Oo.text);
const bodyVocab = evaluate("ei", seg.ei.text);
const faceNames = evaluate("ni", seg.ni.text);
const faceAlias = [...evaluate("ai", seg.ai.text).entries()];
const throughBlinkSet = [...evaluate("oi", seg.oi.text)];
const recipeBodyAlias = Object.fromEntries([...evaluate("wa", cutExpr("wa", "wa=new Map(", 3, ",Ta=[").text).entries()]);

// ── types.ts union-type baseline (for runtime validation) ─────────
const BODY_IDS = ["sphere","cloud","square","sparkle","clover","heartChubby","starFlower","teardrop","tablet","wedge","house","star6","pebble","bean","egg","squircle","capsule","cylinder","hex","gem","crystal","shield","dome","arch","leaf","pumpkin"];
const SHAPE_IDS = ["blob","pebble","bean","egg","squircle","tablet","capsule","cylinder","hex","gem","crystal","wedge","shield","dome","arch","cloud","teardrop","leaf","square","sparkle","clover","flower","heart","house","star","pumpkin"];
const COLOR_IDS = ["black","brown","red","orange","yellow","green","cyan","blue","violet","magenta","gray"];
const FACE_NAMES = ["neutral","happy","surprised","sad","sleepy","squinted","calm","inspecting","confused"];
const MORPH_NAMES = ["thinking","orbit","radar","progress","spawning","dictating","sending","receiving","uploading","bouncing","writing","alerting","powering-down"];
const MARK_STATES = ["idle","listening","thinking","streaming","searching","reading","working","coding","running","computing","controlling","waiting","blocked","finished","failed","sleeping","waking","happy","excited","laughing","proud","curious","playful","shy","surprised","suspicious","angry","confused","sad","drowsy","bored","scared","celebrate","approving","orbit","radar","progress","spawning","loading","dictating","sending","receiving","uploading","writing","alerting","bouncing","powering-down","humming","notifying","dragging","logo","showcase","turntable"];

// research §4.1: 28 clip names → durations
const EXPECTED_CLIPS = {
  Idle_A: 6, Idle_B: 4, Idle_D: 6,
  Working_A: 8, Working_B: 4.8, Working_C: 5, Working_D: 5, Working_E: 4, Working_F: 5,
  Streaming_A: 2.6, Streaming_B: 2.6, Streaming_C: 2.4,
  Blocked_A: 2.12, Blocked_B: 3, Blocked_C: 1.4,
  Done_A: 3.7, Done_B: 1.8, Done_C: 2,
  Logo_A: 4, Logo_B: 4,
  Marketing_A: 4, Marketing_B: 4, Marketing_C: 4, Marketing_D: 4,
  Rotation_A: 6, Rotation_B: 10, Rotation_C: 4,
  Bodymoves_A: 5,
};

// ── Constant assertions (PORTING §3 / spec §8.3; source punctuation verbatim) ──
const CONST_SUBSTRINGS = [
  "Tr=.26,", "Er=4.25/60,", "Dr=2/60,", "Or=1.06;",
  "qa=10,", "sa=.55,", "Ea=.6,", "Ya=.5,", "Ka=.1,",
  "Kr=.1305,", "ri=.26,", "wi=.03,", "Ti=.42,", "Ei=20;",
  "wr=.35,", "Cr=.28,", "so=120,",
];
for (const c of CONST_SUBSTRINGS) {
  check("constants", `SRC contains ${c}`, src.includes(c));
}

// ── gi nine-expression substring assertions (spec §4.2, verbatim from SRC) ─────────
const GI_SUBSTRINGS = [
  "neutral:hi(pi(ri,.57,0,0))",
  "happy:hi(di([.03,.03],0,Kr,{p0:[.16,-.04],p1:[0,.12],p2:[-.16,-.04],isArc:!0},[0,0]))",
  "surprised:hi(pi(.42,.86,0,.03))",
  "inspecting:[pi(.54,.54,0,.04),pi(.36,.36,0,.04)]",
  "sad:hi(pi(ri,.5,-28,-.05))",
  "sleepy:hi(di([.01,0],0,ri/2,{p0:[-.11,.025],p1:[0,-.05],p2:[.11,.025],isArc:!1},[0,0]))",
  "squinted:hi(pi(ri,.5,90,.01))",
  "calm:hi(mi(.296,.247,.05))",
  "confused:hi(di([-.1,0],0,Kr,{p0:[.01,.16],p1:[-.17,0],p2:[.01,-.16],isArc:!1},[0,0]))",
];
for (const g of GI_SUBSTRINGS) {
  check("gi", `SRC contains ${g.slice(0, 48)}${g.length > 48 ? "…" : ""}`, src.includes(g));
}

// ── Hs 26-shape outline constructor parameter substring assertions (spec §2.2) ──────────
const HS_SUBSTRINGS = [
  "pebble:()=>Ms(108,.075,1.1)",
  "bean:()=>js(94,112,.34,Math.PI)",
  "egg:()=>Ss(98,113,.22)",
  "squircle:()=>hs(107,107,3.2)",
  "square:()=>ws(107,28)",
  "tablet:()=>gs(114,74)",
  "capsule:()=>_s(72,113)",
  "cylinder:()=>vs(94,110,48)",
  "hex:()=>ps(114,6,20,Math.PI/6)",
  "gem:()=>hs(112,113,1.5)",
  "shield:()=>xs(98,108,30)",
  "dome:()=>ys(114,82,26)",
  "arch:()=>bs(76,113,42)",
  "cloud:()=>ms([[L-62,L+26,56],[L+62,L+26,54],[L,L+34,62],[L-24,L-30,62],[L+38,L-26,54]])",
  "leaf:()=>As(88,113,1.5)",
  "clover:()=>ks(38,58)",
  "house:()=>Ts(100,110,78,29)",
  "heart:()=>Es",
  "sparkle:()=>Os",
  "star6:()=>Ds",
];
for (const h of HS_SUBSTRINGS) {
  check("Hs", `SRC contains ${h}`, src.includes(h));
}

// ── cc silhouette table substring assertions (spec §2.1/§2.3/§8.5; raw precision) ──
const CC_SUBSTRINGS = [
  "cc={pebble:()=>hc(1.2167999999999999,`pebble`)",
  "egg:()=>hc(1.17,`egg`)",
  "squircle:()=>({size:1.17,silhouette:pc(Tc(`squircle`,.28,.11)),seat:{kind:`front`,faceZ:.28}})",
  "gem:()=>hc(1.17,`gem`)",
  "shield:()=>hc(1.17,`shield`)",
  "dome:()=>hc(1.17,`dome`)",
  "leaf:()=>hc(1.17,`leaf`)",
  "hex:()=>_c(1.2519,Cc(z(`hex`)))",
  "square:()=>_c(1.0413,Cc(z(`square`)))",
  "starFlower:()=>_c(1.3922999999999999,Lc())",
  "sparkle:()=>_c(1.521,Cc(z(`sparkle`)))",
  "clover:()=>_c(1.0881,Cc(z(`clover`)))",
  "house:()=>_c(1.17,Cc(z(`house`)))",
  "star6:()=>vc(1.4976,Cc(z(`star6`)),.3,.18)",
  "crystal:()=>({size:1.3805999999999998,silhouette:pc(Ec()),seat:{kind:`front`,faceZ:Math.sqrt(3)/2*.64}})",
  "cloud:()=>bc(1.3455,Cc(z(`cloud`,1)),.72)",
  "heartChubby:()=>bc(1.3571999999999997,os,.62)",
  "cylinder:()=>gc(`cylinder`,(e,t)=>(t+e)*.5)",
  "arch:()=>gc(`arch`,(e,t)=>e+(t-e)*.42)",
  "size:1.3922999999999999,silhouette:{kind:`solid`,samples:[],balls:Nc(`tablet`,`x`)",
  "size:1.3590719999999998,silhouette:mc(kc(t))",
  "size:1.318122,silhouette:mc(kc(t))",
  "_c(e,t){return vc(e,t,Ys,Xs)}",
  "Ys=.36,Xs=.22",
];
for (const c of CC_SUBSTRINGS) {
  check("cc", `SRC contains ${c.slice(0, 60)}${c.length > 60 ? "…" : ""}`, src.includes(c));
}
// Actual entry count of the cc segment: after slicing the whole segment, assert all 24 entry headers by name (sphere/pumpkin take the special-case path).
const ccSeg = cutExpr("cc", "cc={pebble:()=>hc(1.2167999999999999,", 3, ",lc=new Map");
const CC_ENTRIES = ["pebble","bean","egg","squircle","tablet","capsule","cylinder","hex","gem","crystal","wedge","shield","dome","arch","cloud","teardrop","leaf","square","starFlower","sparkle","clover","heartChubby","house","star6"];
check("cc", "cc table has 24 entries (sphere/pumpkin special-case paths are not in the table)",
  ccSeg.text.startsWith("{") && CC_ENTRIES.every((e) => ccSeg.text.includes(`${e}:()=>`)),
  CC_ENTRIES.filter((e) => !ccSeg.text.includes(`${e}:()=>`)).join(",") || "all hit");

// ── Count and structure assertions ──────────────────
check("clips", "count = 28", clips.length === 28, `got ${clips.length}`);
const clipNames = clips.map((c) => c.name);
const expectedNames = Object.keys(EXPECTED_CLIPS);
check("clips", "name set = the 28 clips of research §4.1",
  expectedNames.length === 28 && expectedNames.every((n) => clipNames.includes(n)) && new Set(clipNames).size === 28,
  `missing ${expectedNames.filter((n) => !clipNames.includes(n)).join(",") || "none"}`);
const badDur = clipNames.filter((n) => {
  const c = clips.find((x) => x.name === n);
  return c.duration !== EXPECTED_CLIPS[n];
});
check("clips", "all 28 durations equal research §4.1", badDur.length === 0,
  badDur.map((n) => `${n}:${clips.find((x) => x.name === n).duration}≠${EXPECTED_CLIPS[n]}`).join(" ") || "none");
const clipTopKeys = new Set(clips.flatMap((c) => Object.keys(c)));
check("clips", "top-level fields ⊆ {name,duration,body,squashAnchor,workArea,inspect,tracks}",
  [...clipTopKeys].every((k) => ["name","duration","body","squashAnchor","workArea","inspect","tracks"].includes(k)),
  [...clipTopKeys].join(","));
// Ca track alias table (source verbatim): position/rotation/squash/lids/expression pass through, scale→zoom,
// abbreviated pos/rot/scl/zoom/expr. Raw track names actually used in the oo corpus:
const trackKeys = new Set(clips.flatMap((c) => Object.keys(c.tracks ?? {})));
check("clips", "track keys ⊆ raw names supported by Ca {position,rotation,squash,scale,zoom,lids,expression}",
  [...trackKeys].every((k) => ["position","rotation","squash","scale","zoom","lids","expression"].includes(k)),
  [...trackKeys].join(","));
const kfKeys = new Set(
  clips.flatMap((c) => Object.values(c.tracks ?? {}).flat().flatMap((kf) => Object.keys(kf))),
);
check("clips", "keyframe fields ⊆ {t,v,ease,cut}",
  [...kfKeys].every((k) => ["t","v","ease","cut"].includes(k)), [...kfKeys].join(","));

check("co", "WORKING_CLIPS = Working_A..F (6 clips)",
  workingClips.clips.length === 6 && workingClips.clips.every((n, i) => n === `Working_${"ABCDEF"[i]}`));

// Note: sn/lo actually have 53 states (Lifecycle 17 + Reactions 17 + Morphs 13 + Product 3 + Brand 3).
// PORTING §3 / spec §8 / research §4.2 / the types.ts comment all say 54 — research labeled the 17-member
// Lifecycle group as (18), and 54 = 18+17+13+3+3 is an arithmetic slip; the types.ts MarkState union itself has 53 members.
const loKeys = Object.keys(lo);
check("lo", "key count = 53 (docs say 54, see discrepancy list)", loKeys.length === 53, `got ${loKeys.length}`);
const missingStates = MARK_STATES.filter((s) => !(s in lo));
const extraStates = loKeys.filter((s) => !MARK_STATES.includes(s));
check("lo", "key set = types.ts MarkState union (53)", missingStates.length === 0 && extraStates.length === 0,
  `missing ${missingStates.join(",") || "none"}; extra ${extraStates.join(",") || "none"}`);
const badFace = loKeys.filter((k) => lo[k].face !== undefined && !FACE_NAMES.includes(lo[k].face));
check("lo", "face values ⊆ FaceName", badFace.length === 0, badFace.map((k) => `${k}:${lo[k].face}`).join(" ") || "none");
const badMorph = loKeys.filter((k) => lo[k].morph !== undefined && !MORPH_NAMES.includes(lo[k].morph));
check("lo", "morph values ⊆ StateMorphName", badMorph.length === 0, badMorph.map((k) => `${k}:${lo[k].morph}`).join(" ") || "none");
const badNext = loKeys.filter((k) => lo[k].next !== undefined && !MARK_STATES.includes(lo[k].next));
check("lo", "next values ⊆ MarkState", badNext.length === 0, badNext.map((k) => `${k}:${lo[k].next}`).join(" ") || "none");
check("lo", "blocked: next=drowsy and holdSeconds=120",
  lo.blocked?.next === "drowsy" && lo.blocked?.holdSeconds === 120);
check("lo", "waking: face=surprised, next=idle, holdSeconds=1.6",
  lo.waking?.face === "surprised" && lo.waking?.next === "idle" && lo.waking?.holdSeconds === 1.6);
check("lo", "idle: 5 clips + compactClips=[Idle_B]",
  lo.idle?.clips?.length === 5 && lo.idle?.compactClips?.length === 1 && lo.idle.compactClips[0] === "Idle_B");

// ── qr nine numbers (spec §3.1/§8.1) ────────────────
const EXPECTED_QR = [
  { A: [0.01722, 0.45638, 0.88962], B: [0.186, 0.20949, 0.95996], N: [0.82924, 0.4906, -0.26773] },
  { A: [0.48863, 0.67924, 0.54762], B: [0.65674, 0.43195, 0.61815], N: [0.60389, 0.18972, -0.77416] },
];
check("qr", "both A/B/N groups, 18 components equal value-for-value (spec §3.1)",
  qr.length === 2 && qr.every((e, i) => ["A","B","N"].every((k) =>
    e[k].length === 3 && e[k].every((v, j) => v === EXPECTED_QR[i][k][j]))));
check("qr", "eye0 A first component = .01722", qr[0]?.A?.[0] === 0.01722);
check("qr", "eye1 A first component = .48863", qr[1]?.A?.[0] === 0.48863);

// ── Vocabulary count assertions ────────────
check("vocab", "ei = 26 and set = types.ts BodyId",
  bodyVocab.length === 26 && BODY_IDS.every((b) => bodyVocab.includes(b)) && bodyVocab.every((b) => BODY_IDS.includes(b)));
check("vocab", "ni = 9 and set = FaceName",
  faceNames.length === 9 && faceNames.every((f) => FACE_NAMES.includes(f)));
const EXPECTED_AI = [["thinking","sad"],["strange","inspecting"],["angry","neutral"],["inspect","inspecting"],["squint","squinted"],["idle","neutral"],["smile","happy"],["sleep","sleepy"]];
check("vocab", "ai = 8 items, content/order matching spec §4.2",
  faceAlias.length === 8 && faceAlias.every(([k, v], i) => EXPECTED_AI[i][0] === k && EXPECTED_AI[i][1] === v),
  faceAlias.map(([k, v]) => `${k}→${v}`).join(" "));
check("vocab", "oi = 5 items {sad,happy,confused,squinted,sleepy}",
  throughBlinkSet.length === 5 && ["sad","happy","confused","squinted","sleepy"].every((s) => throughBlinkSet.includes(s)));
check("vocab", "sn flattened = 53 and = types.ts MarkState union",
  states.length === 53 && MARK_STATES.every((s) => states.includes(s)) && states.every((s) => MARK_STATES.includes(s)));
discrepancies.push("state count is actually 53 (Lifecycle 17, not 18): the 54 in PORTING §3/spec §8/research §4.2/the types.ts comment is a counting slip; the types.ts MarkState union actually has 53 members, fully consistent with SRC sn/lo");
check("vocab", "cn = 25 and ⊆ ShapeId",
  pickerShapes.length === 25 && pickerShapes.every((s) => SHAPE_IDS.includes(s)));
check("vocab", "ln = 1（pumpkin, gate sand_pumpkin_2026, color orange）",
  seasonalShapes.length === 1 && seasonalShapes[0].shape === "pumpkin" && seasonalShapes[0].pickerGate === "sand_pumpkin_2026" && seasonalShapes[0].pickerColor === "orange");
check("vocab", "un = 26 = cn ∪ {pumpkin}",
  allShapeIds.length === 26 && SHAPE_IDS.every((s) => allShapeIds.includes(s)));
check("vocab", "dn Set = 26", shapeIdSet.size === 26);
check("vocab", "fn = 8", defaultShapeSet.length === 8);
check("vocab", "fn content", defaultShapeSet.join(",") === "blob,pebble,squircle,tablet,wedge,hex,cloud,teardrop");
check("vocab", "pn = 13", menubarShapeSet.length === 13);
check("vocab", "pn content", menubarShapeSet.join(",") === "blob,cloud,square,sparkle,clover,heart,flower,teardrop,tablet,wedge,house,star,hex");
check("vocab", "wa = 7 entries (blob/sphereWide→sphere, arch→horseshoe, spark→sparkle, star→star6, heart→heartChubby, hexagon→hex)",
  Object.keys(recipeBodyAlias).length === 7 && recipeBodyAlias.arch === "horseshoe");
discrepancies.push("wa actually has 7 entries (task description said 6); arch→horseshoe kept verbatim (horseshoe is not in the ei vocabulary; runtime ja() falls back to sphere)");

const ooKeys = Object.keys(staticEyeSeats);
check("Oo", `key count = ${ooKeys.length} (= ei − {sphere,pumpkin}; PORTING/spec §8 say 26, but the spec §4.7 table itself lists only 24 rows)`,
  ooKeys.length === 24 && ooKeys.every((k) => BODY_IDS.includes(k) && k !== "sphere" && k !== "pumpkin"),
  ooKeys.join(","));
discrepancies.push("Oo actually has 24 keys (sphere/pumpkin have no static eye seats and take the special-case path); PORTING §2/§3 and spec §8 claim 26, which does not match");
check("Oo", "hex = {width:.26,height:.57,gap:.64,shiftY:.12}",
  staticEyeSeats.hex?.width === 0.26 && staticEyeSeats.hex?.height === 0.57 && staticEyeSeats.hex?.gap === 0.64 && staticEyeSeats.hex?.shiftY === 0.12);
check("Oo", "all 4 numeric fields complete",
  ooKeys.every((k) => ["width","height","gap","shiftY"].every((f) => typeof staticEyeSeats[k][f] === "number")));

check("palette", "rn = 11 and id set = ColorId",
  palette.length === 11 && palette.every((p) => COLOR_IDS.includes(p.id)) && COLOR_IDS.every((c) => palette.some((p) => p.id === c)));
check("palette", "black=#000 / magenta=#FF309B / gray=#777777",
  palette[0].id === "black" && palette[0].value === "#000" &&
  palette.find((p) => p.id === "magenta").value === "#FF309B" &&
  palette.find((p) => p.id === "gray").value === "#777777");
check("palette", "lr keys = 11 colors, black.darkTo=#C2C2C2",
  Object.keys(gradientPairs).length === 11 && gradientPairs.black.darkTo === "#C2C2C2");
check("palette", "dr keys = 11 colors, black={#000000,#FFFFFF}",
  Object.keys(flatColors).length === 11 && flatColors.black.light === "#000000" && flatColors.black.dark === "#FFFFFF");

// ── Generated files ────────────────────
mkdirSync(DATA_DIR, { recursive: true });
const header = [
  "// GENERATED by tools/extractEngineData.mjs — Grok Bot 0.79.3",
  `// SRC: ${srcFile} (sha256:${sha256})`,
  `// Extracted: ${today}`,
].join("\n") + "\n\n";
const js = (v) => JSON.stringify(v, null, 2);

const files = {
  "clips.generated.ts":
    header +
    "import type { RawClip } from \"../types\";\n\n" +
    "// 28 hand-authored clips (Motion Lab export; ease is a 17-digit hand-tuned curve, values kept verbatim).\n" +
    "// Note: expression-track keyframes carry the source field cut (RawKeyframe.cut); v may be an expression name string or blink.\n" +
    `export const CLIPS: RawClip[] = ${js(clips)};\n`,

  "director.generated.ts":
    header +
    "import type { DirectorEntry, MarkState } from \"../types\";\n\n" +
    "// Shared clip pool for the working family.\n" +
    `export const WORKING_CLIPS: string[] = ${js(workingClips.clips)};\n\n` +
    "// 53-state director table (face/morph/next/holdSeconds raw values; in SRC the 6 working-family\n" +
    "// entries directly alias the co object and blocked.holdSeconds references constant so=120; expanded to runtime values here).\n" +
    `export const DIRECTOR_TABLE: Record<MarkState, DirectorEntry> = ${js(lo)};\n`,

  "eyeAnchors.generated.ts":
    header +
    "import type { Vec3 } from \"../types\";\n\n" +
    "// Unit-sphere anchor frames for the two eye capsules (A=start direction, B=end direction, N=reference normal; spec §3.1).\n" +
    `export const EYE_ANCHORS: { A: Vec3; B: Vec3; N: Vec3 }[] = ${js(qr)};\n`,

  "shapes.generated.ts":
    header +
    "import type { BodyId, MarkState, ShapeId } from \"../types\";\n\n" +
    "// Engine body vocabulary (26; pumpkin stubbed this round).\n" +
    `export const BODY_VOCAB: BodyId[] = ${js(bodyVocab)};\n\n` +
    "// Clip recipe body names → BodyId aliases (arch→horseshoe is source-verbatim; do NOT \"fix\" it).\n" +
    `export const RECIPE_BODY_ALIAS: Record<string, string> = ${js(recipeBodyAlias)};\n\n` +
    "// 53 states flattened (Lifecycle 17/Reactions 17/Morphs 13/Product 3/Brand 3).\n" +
    `export const STATES: MarkState[] = ${js(states)};\n\n` +
    "// Picker shapes (25).\n" +
    `export const PICKER_SHAPES: ShapeId[] = ${js(pickerShapes)};\n\n` +
    "// Seasonal shapes (statsig gate).\n" +
    `export const SEASONAL_SHAPES: { shape: ShapeId; pickerGate: string; pickerColor: string }[] = ${js(seasonalShapes)};\n\n` +
    "// All shape ids = cn ∪ seasonal shapes.\n" +
    `export const ALL_SHAPE_IDS: ShapeId[] = ${js(allShapeIds)};\n\n` +
    "// Default shape set (8).\n" +
    `export const DEFAULT_SHAPE_SET: ShapeId[] = ${js(defaultShapeSet)};\n\n` +
    "// Menubar shape set (13).\n" +
    `export const MENUBAR_SHAPE_SET: ShapeId[] = ${js(menubarShapeSet)};\n\n` +
    "// Static eye-seat table (24: ei − {sphere,pumpkin}; ratios relative to the baseline eye, spec §4.7).\n" +
    `export const STATIC_EYE_SEATS: Record<string, { width: number; height: number; gap: number; shiftY: number }> = ${js(staticEyeSeats)};\n`,

  "appearance.generated.ts":
    header +
    "import type { ColorId } from \"../types\";\n\n" +
    "// 11-color palette.\n" +
    `export const PALETTE: { id: ColorId; label: string; value: string }[] = ${js(palette)};\n\n` +
    "// Light/dark gradient pairs.\n" +
    `export const GRADIENT_PAIRS: Record<ColorId, { lightFrom: string; lightTo: string; darkFrom: string; darkTo: string }> = ${js(gradientPairs)};\n\n` +
    "// Light/dark solid color pairs.\n" +
    `export const FLAT_COLORS: Record<ColorId, { light: string; dark: string }> = ${js(flatColors)};\n`,
};

const sizes = [];
for (const [name, content] of Object.entries(files)) {
  const p = join(DATA_DIR, name);
  writeFileSync(p, content, "utf8");
  sizes.push({ name, bytes: statSync(p).size });
}

// ── Summary output ────────────────────
const groups = [...new Set(results.map((r) => r.group))];
const failed = results.filter((r) => !r.pass);
console.log(`SRC: ${srcFile}`);
console.log(`SHA-256: ${sha256}`);
console.log("");
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  const ok = rs.filter((r) => r.pass).length;
  console.log(`${g}: ${ok}/${rs.length} passed`);
}
console.log("");
console.log("Generated files:");
for (const s of sizes) console.log(`  ${s.name}  ${s.bytes} bytes`);
if (discrepancies.length) {
  console.log("");
  console.log("Mismatch with PORTING/spec prose (SRC wins; spec unchanged):");
  for (const d of discrepancies) console.log(`  - ${d}`);
}
console.log("");
console.log(failed.length === 0 ? "ALL ASSERTIONS PASSED" : `${failed.length} ASSERTION(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
