# grok-bot-mark 移植简报（子代理工作契约）

目标：把 Grok Bot 0.79.3 的 mark 引擎逐函数移植为本目录下的 TS。设计依据：
`docs/grok-bot-mark-component-design.md`（架构）、`docs/grok-bot-mark-eye-body-spec.md`（精确数值，§8 断言清单）。

## 0. 硬规则

1. **逐函数搬运**：公式、求值顺序、分支结构、缓存键/容量一律保持。禁止代数化简、合并分支、"顺手优化"。标识符从混淆名改为语义名。符号→源码行映射由本文件 §2 承载；代码文件内**不写** `// src:` 溯源行。
1a. **注释政策**（unless assuredly necessary, no/less comments in code files）：代码内注释一律**英文**；只保留删除后会导致维护者破坏保真或正确性的陷阱说明（单行不变式）；溯源、过程叙事、复述代码的注释一律不写。
4. **范围裁剪**（已定）：pumpkin → `geometry/silhouette3d.ts` 中 `pumpkin` 走 sphere 桩（导出 `PUMPKIN_DISABLED = true` 常量，身体解析处短路）；proof 着色（`Bu/_l/Ml/Nl…` 第二网格系统）→ 不移植，渲染层 `isProof` 直接忽略；托盘静帧导出、MarkPhoto/Mirror、全局注册表 → 不做。
5. 风格对齐 khala：无 barrel、相对导入、strict TS（不用 any；必要时 `!` 断言要少而准）、测试与源码同目录 `*.test.ts`（vitest）。
6. 验证方式：`npx vitest run <你的测试文件>` 必须绿（vitest/esbuild 不做类型检查，但代码要能跑）；全仓 `pnpm build`（tsc）由主线程集成时统一修。
7. 不修改 `C:\Users\Q\AppData\Local\Programs\Grok Bot`（只读）；解包参考件在仓库外。

## 1. 源材料（只读）

- **SRC**（单行压缩原文件）：
  `C:/Users/Q/UserSpace/01.Lab/khala/.tmp-grokbot/unpacked/dist/renderer/assets/index.eager-common-B73stST-1.js`
  ⚠ Windows 下该文件偶尔"找不到"——用 glob 方式访问（bash: `F=$(echo index.eager-common*)`）。它是**一行**，用 `dd`/`rg -bo` 按字节偏移取段。
- **折行可读 dump**（每行 180 字符），位于 `C:/Users/Q/UserSpace/01.Lab/khala/.tmp-grokbot/.tmp-engine/`：
  - `A.txt` ← SRC 字节 174000 起（眼睛/数学/表情/木偶）
  - `B.txt` ← 255000 起（剪辑数据尾部+导演表头，与 D 重叠）
  - `C.txt` ← 339000 起（渲染/SVG patch/宿主/glyph）
  - `D.txt` ← 260000 起（调度器/眼位/几何）
  - 换算：`SRC 偏移 = 段基址 + (行号-1)*180`。dump 行号引用如 `A:106`。
- 规格文档 `docs/grok-bot-mark-eye-body-spec.md` 有已核对的数值表（注意其声明：显示位截断，真值以 SRC/提取产物为准）。

## 2. 模块 → 源符号映射表

### identity/ + engine/math + svgPatch（Wave1-A2）

| 目标 | 源符号（dump 行） |
|---|---|
| `engine/math/quat.ts` | `Lr`四元数乘 A:100、`Rr`轴角 A:101、`zr`归一 A:102、`Br`双向量最短弧 A:102、`Vr`→Mat3 A:103、`Hr`欧拉(pitch,yaw,roll 度) A:104、`Ur` Mat3→欧拉 A:104、`Wr` quat→欧拉 A:105、`Gr` Mat3×vec A:105 |
| `engine/math/spring.ts` | `mr`初态 A:94、`hr`积分(欠阻尼式) A:94、`gr=1/120`、`_r`子步 A:95、`vr`easeInOutCubic、`P`cubicOut、`yr`easeOutBack A:95、`Mr`smoothstep、`br`smoothstep(重复实现，两个都留) A:95-98 |
| `engine/math/bezier.ts` | `kr`值、`Ar`导数、`jr`Newton 8 迭代求解 A:96-98 |
| `engine/math/rand.ts` | `xn` FNV-1a、`Sn`色种子、`Cn` mulberry、`wn/Tn/En`色索引、`Dn`雪崩、`On`形索引 A:66-69；`ba` mulberry 变体 D:176 |
| `engine/math/misc.ts` | `N` clamp A:95 |
| `identity/palette.ts` | `rn` 11 色 A:54-57、`an`、`on`、`lr` light/dark 渐变对、`ur`、`dr`、`fr`、`pr` A:85-93 |
| `identity/shapes.ts` | `cn/ln/un/dn`、`fn` 默认 8 形、`pn` 菜单 13 形、`hn` A:62-65、`wa` ShapeId→BodyId 别名表 A:184 |
| `identity/agentIdentity.ts` | `kn/An/jn/Mn/Nn/En/On` A:68-71 |
| `render/svgTree.ts` | `Y`节点、`gp` svg 根、`_p` 序列化(转义 `mp/hp`、void 集 `pp`)、`Z` 数字 fmt C:172-179,432-435、`Ah/Z` 圆整 C:21,106 |
| `svgPatch.ts` | `n_` patcher（WeakMap 缓存+槽位比对）、`r_/i_/a_` C:175-179 |

### geometry/（Wave1-A3）

| 目标 | 源符号 |
|---|---|
| `pathUtils.ts` | `ls` PathBuilder(M/L/C/Q/arc K=4/3tan(θ/4)) D:96-100、`us` Catmull D:101、`ds` 参数采样 D:102、`Ns` path 解析重采样 D:159-164、`Ps` y 扫描跨度表 D:164-168、`Is` 96 射线凸包环 D:168-170、`zs` 适配 228.44(k 钳 .9-1.35) D:171、`Vs` 归一化 D:172-173、`Ls` 数字平移 D:170、`Ws` 形状缓存 D:177、`R/cs/ss` D:95 |
| `outline2d.ts` | `Hs` 26 形状表 D:174-177 + 构造器：`Ms`谐波 D:158、`js`双瓣 D:157、`hs`超椭圆 D:105、`Ss` D:111、`ws/fs` D:102,106、`gs/_s/vs/ys/bs/xs` D:106-110、`ps` D:103、`ms`圆并 D:104、`As` D:111、`ks` D:156、`Ts` D:113、`Cs` D:112、`Es/Os/Ds` 三个 path 字面量 D:113-156（**逐字符照抄**）、`Ks/qs` D:177 |
| `silhouette3d.ts` | `cc` 26 条目 D:178-190（含 `hc/gc/_c/vc/bc/xc/Sc/xc` 构造器 D:190-230：`kc`旋转体 D:208-213、`Ac`纬环 D:212-213、`Dc`跨度查询 D:205-208、`Oc` D:213、`Nc`球带 D:214-215、`Pc` D:215、`Fc` bean 球云 D:216-218、`Ic`倒角环 D:219-221、`Lc` starFlower 花形 D:222-224、`Rc/zc` loft D:224-230、`mc/pc/fc/kl` 包装 D:190-196）；`dc` 缓存 D:190 |
| `project.ts` | `Qc/nl/rl/il/al/ol/sl/el/$c` D:230-255（`sl` 球云极角合并含 `cl` 2D 凸包+`ll` 排序 D:243-247；`ul` loft 阴影 D:247-255） |
| `convexHull.ts` | `Yo/Xo/Zo/Qo/$o/es/ts/ns/rs/is/as` 3D quickhull D:48-57 |
| `eyeSeats2d.ts` | `Oo` 24 眼位表 D:10-20（数据在 shapes.generated.ts，此处是逻辑）+ `ko/jo/Mo/No/Po/Fo/Io/Lo/Ro/zo/Bo/Vo/Ho/Uo/Wp/Go/Do` D:20-46（`_o=.26,vo=.57,yo=.64,bo=.04,xo=.12` 等常数 D:9） |

### engine/ 核心（Wave2-A5）

| 目标 | 源符号 |
|---|---|
| `clip.ts` | `Ca`轨道别名 A:183-184、`Na/Fa/Ia`装载归一 A:186-192（含 `Pa` blink 展开 A:187）、`La`采样 A:192-193、`Ra`静息姿态 A:193-194、`za/Ba/Va/Ha`桥接 A:194-199、`Oa`默认剪辑 A:185-186、`ka/Za` rest A:185、`Da/Ea/Aa/ja/Ma` A:185-186、`xr=[.42,0,.58,1]`默认ease A:98 |
| `pokes.ts` | `Xi/ra/ia/aa` A:168-172（`Zi=.9,Qi=.4,$i=.62,ea=.3,ta=.5,na=16`） |
| `gaze.ts` | `oa=1/60,sa=.55,ca,la=2`、`ua/da/fa/fe` A:172-173 + puppet 内 `pe` 的 `Xa=.001` A:201 |
| `looks.ts` | `Ua` 5 预设 A:199-200（`Ga=.5,Wa=[.42,0,.58,1]` A:200） |
| `morph.ts` | `Sa` 控制器 A:174-182：`pa`状态→glyph D:174-175、`ma=π,ha=.1,ga=2654435769`、`_a/va/ya`占空比 A:175、`ba` PRNG、`xa`、弹簧 k=14/11/14 A:180 |
| `puppet.ts` | `eo` A:201-232 全量（内部闭包函数 `ne/k/re/ie/A/j/ae/oe/se/ce/le/ue/de/fe/pe/me/he/ge/_e/ve/ye` 全部保留为闭包或私有函数；`Ka=.1,qa=10,Ja=1e-4,Ya=.5,Xa=.001,Qa,$a,Wa` A:200-201；rest 用 `clip.ts` 的 `ka`） |
| `director.ts` | `go` D:4-9 + `po/mo/ho` D:2-4；播放列表/数据来自 data/director.generated.ts |

### faces（Wave2-A4）

| 目标 | 源符号 |
|---|---|
| `eyesModel.ts` | `si/ci/li/ui/di/fi/pi/mi/hi` A:116-127（`ii=18`路径浮点、`Kr=.1305` A:106）、`Gi` inspect A:155-157（`Ei=20` A:133）、`Wi/Hi/Ui` 眨眼下压 A:151-154（`wi=.03` A:133）、`Bi/zi`压扁(`Ti=.42`) A:150-151、`Ri/Li/ji/Mi/Ni` D:140-142+A:138-140、`Pi` A:142、`Fi/Ii/Ai/ki/Di/Oi/xi/Si/Ci/qi` A:131-155 |
| `faces.ts` | `gi` 9 表情 A:127-130（数值见 spec §4.2）、`ni/ai/oi/ri` A:114-115、`Yi` FaceModule A:158-168（blink 包络 `Nr/Pr/Fr` A:98-99,158-160；`Tr=.26,wr=.35,Cr=.28,Er=4.25/60,Dr=2/60,Or=1.06` A:98-99）、眼锚点帧 `$r`（运行时由 data/eyeAnchors 的 `qr` 派生：`Yr/Xr/Zr/$r/Da/ch` A:107-112）→ 导出 `EYE_FRAMES`/`REST_EULER`/`EYE_FLIP` 惰性单例 |

### render/（Wave2-A6 + Wave3-A7）

| 目标 | 源符号 |
|---|---|
| `eyesRender.ts`(A6) | `zm/Bm/Vm/Hm/Um/Wm/Gm`缓存+LOD C:66-69（`zm=.02,Bm=16,Vm=.015,Hm=400,Um=512,Wm=5`）、`qm/Jm/Ym/Xm` SDF+包围盒 C:69-76、`Zm` D:76? (在 C:76)、marching squares `sd/cd/ld/ud/dd/fd/pd/md` D:352-370（`nd=60,rd=256,id=24,ad=2e4,od=.2` D:352）、半球裁剪 `Sm/Cm/wm/Tm/Em/Dm/Om/km/Am/jm/Mm/Nm/Pm/Fm/Im/Lm/Rm/xm` C:42-66、`gh`球面映射 C:89-91、`fh` C:80-81、`mh`弧转折线 C:83-84 |
| `spherePath.ts`(A6) | `dh` C:77-80、`ph` C:81-83、glow `bh/Gp/Kp` C:20-21,94-96、`vh/yh` path 组装 C:92-94、`Em`椭圆点 D:51、`Eh`色停插值 C:105-106、（proof `xh/Sh/Ch/wh/Tu/ku` **跳过**） |
| `bodyPaths.ts`(A7) | `kp/Ap` C:1-2,439-441、`Lp/Rp/zp` C:12-14、`Bp/Vp/Hp` C:15-18、`Up/Wp` C:18-19、`Np/Pp/Fp/Ip/Mp` C:9-11（`bp=180/π,Sp`）、LOD 集 `wp={'pumpkin'}`、缓存 `vp=144,yp=184/256,xp=16e6,Cp=256` C:435、多边形并 `nu/ru/iu/au/ou/su/cu/lu/uu/du/fu/pu/mu/hu/gu` D:305-327、`gu`圆整 D:327 |
| `morphGlyphs.ts`(A7) | `Rg`主控 C:146-153、`Fh/Ih`表 C:108-110、glyph 生成器 `Tg/Eg/Dg/Og/kg/Ag/jg/Mg/Ng/Pg/Fg/Ig/Lg` C:126-146、辅助 `hg/gg/_g/vg/bg/xg/Sg/Cg/wg` C:116-126、`jh=114.5,Mh=.62` C:108、`L=114.2705` D:47、`ng/tg/ag/og/sg/cg/lg/ug/dg/fg/pg` C:111-116、`Ko/Ks/qs/Bs/Ls(数字版)/Rs=228.44/Ns(此处为解析)` C:177/D:159-173 注意区分 |
| `renderFrame.ts`(A7) | `Qg`分发 C:174-175、`Ug`多体混合 C:154-158（`zg=Qp(192),Bg=om(96),Vg=.6`）、`Gg/Wg` C:158-159、`Yg/Xg`多体眼匹配 C:170-174、极坐标重采样 `em/tm/nm/rm/im/am/om/sm/cm/lm/um/dm/fm/pm/mm/hm/_m/vm/gm` C:22-34、`Kg/qg` C:165-166、`Z` fmt C:173 |
| `markHost.ts`(A8) | `h_`宿主 C:181-202、`m_` props 归一 C:183-184、`l_=48,u_=60,d_=.1,f_`(FNV 同 rand.ts) C:181-182；rAF/IO/settle/wake/reducedMotion 全保留 |

### data/（Wave1-A1 生成）

| 文件 | 内容 | 源锚点（SRC 内字符串锚） |
|---|---|---|
| `clips.generated.ts` | `oo` 28 支（RawClip[]） | `var oo=[{name:\`Blocked_A\`` → `],so=120` 前 |
| `director.generated.ts` | `co`+`lo`（DirectorEntry & Record<MarkState,DirectorEntry>） | `co={clips:[` → `},uo=new Map`；断言 `so=120` |
| `eyeAnchors.generated.ts` | `qr` 两组 A/B/N | `qr=[{A:[.01722` → 收口 `]}]`（在 `,Jr=` 前） |
| `shapes.generated.ts` | `ei`(26)、`wa` 别名(7 项)、`sn`53、`cn/ln/un/dn/fn/pn`、`Oo`24 眼位 | `ei=\`sphere.`、`wa=new Map([[`blob`,`sphere`]`、`sn=[{label:\`Lifecycle\``、`Oo={cloud:{`→`};function ko`、`cn=[\`blob\``、`fn=[`、`pn=[` |
| `appearance.generated.ts` | `rn` 11 色、`lr/dr` 渐变对 | `rn=[{id:\`black\``、`var lr={black:`、`var dr={black:` |
| （不入 data）`gi`9表情/Hs/cc 表 | 手写在 faces.ts/outline2d.ts/silhouette3d.ts（spec §4.2/§2.2/§2.1 有全参数），脚本只做**子串断言** | 如 SRC 含 `` neutral:hi(pi(ri,.57,0,0)) ``、`Ms(108,.075,1.1)`、`hc(1.2168,`pekin…`` 注意精度 |

## 3. 断言基线（A1 脚本必须校验）

来自 spec §8：qr 九数、gi 参数、常数 `ri=.26,Kr=.1305,wi=.03,Ti=.42,Ei=20,Tr=.26,wr=.35,Cr=.28,Er=4.25/60,Dr=2/60,Or=1.06,Ea=.6,Ya=.5,Ka=.1,qa=10,sa=.55`、Oo 24 行、cc size 26、ai 8 项、oi 5 项、ei 26、ni 9、剪辑 28、状态 53。生成文件头写 SRC 的 SHA-256 与提取时间。

## 4. 集成接口约定（跨代理）

- 渲染入口（A6/A7 提供，A8 消费）：`renderFrame.ts` 导出
  `renderMarkToNode(frame: MarkFrame, appearance: MarkAppearance, resolution: number, id: string, opts?: { displaySize?: number }): SvgNode`
  （即 `Qg`，pumpkin/proof 分支按 §0.4 裁剪）
- `svgPatch.ts` 导出 `patchSvg(host: HTMLElement, node: SvgNode): void`（即 `n_`，host 内挂 svg）。
- `markHost.ts` 导出 `createMarkHost(props: MarkHostProps): MarkHost`；内部 `createPuppet`（engine/puppet）、`createDirector`（engine/director）、`renderMarkToNode`、`patchSvg`。
- director/puppet 构造签名：`createDirector(puppet: Puppet, state: MarkState, init: DirectorInit)`；`createPuppet(init?: PuppetInit)`。
- faces：`createFaceModule(): FaceModule`；`getEyeFrames(): {M,T,C}[]`、`getRestEuler(): [number,number,number]`、`getEyeFlip(): boolean[]`。
- 所有模块**不得** import React（除 GrokBotMark/useMarkHost/markHost 中 DOM API 外，引擎层无 DOM；svgPatch/markHost 用 DOM 但不用 React）。

## 5. 测试要求（每代理至少）

- math：quat↔欧拉往返（±180° 内）、bezSolve 端点、PRNG 定种子序列快照。
- geometry：`ws(107,28)` 面积≈(214-2·28+π·28)² 量级、`Is` 环闭合、quickhull 立方体 8 顶点 12 面、`Vs` 归一化 bbox≈[0,228.44]。
- faces：9 表情的 wid/oval/pts 数量断言（对照 spec §4.2）；blink 包络 t=0/.5/1 采样。
- engine：固定 seed 下 director 首个 clip 名与 phase；puppet advance(1/60)×120 后 frame().quat 分量有限且循环数>0；blocked holdSeconds=120 迁移（用大 dt 快进）。
- render：sphere 静帧 `dh` 产出非空 path 字符串且以 `M` 开头 `Z` 结尾；`_p` 序列化含 `<svg`。
- svgPatch：同结构二次 patch 只改值（用 attribute proxy 计数）。

## 6. 示例 App（A8）

`samples/MarkShowcaseApp.tsx`：160px 主 mark（状态选择 53、形状选择 25、poke 按钮 spin/bounce/nod、blink、look、gaze 跟随开关、paused、seed 输入）+ 网格区（各代表状态 × 各形状小图，网格项 `maxFrameRate={30}` 降载）。注册进 `apps/mockApps.ts`（id `a-mark`，icon 用 lucide `Bot`）。样式追加到 `chat.css`（`.grok-bot-mark` 段）+ tokens 进 `tokens.css`（`--grok-bot-ink/--grok-bot-eye`）。

> 实现期落位说明：`render/renderFrame.ts` 是文档化转发壳，`renderMarkToNode`(Qg) 与多体混合/极坐标重采样族的实现位于 `render/morphGlyphs.ts` 末段（三分发需要 sphere/sprite/blend 全依赖）。
