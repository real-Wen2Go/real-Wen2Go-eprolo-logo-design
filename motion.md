# EPROLO 品牌收束 · 竖屏 9:16

![预览](out/stinger-vertical.gif)

200,000+ 商品的瀑布墙被吸进一个绿色圆环，环里落下一个 `e`，字标横向擦出，slogan 逐词落位。

这份 md 是**规格本身**，不是说明。里面的参数是确定性的——交给任何人（或任何 AI）照着写，出的片子会和 `out/stinger-vertical.mp4` 一致。改文案、改节奏、改比例都从这里的表格改，不要从画面反推。

```yaml
画幅      1080 × 1920（9:16）
时长      2.30 s
帧率      60 fps / 138 帧
底色      #FAFBF9
品牌绿    #31CB49
墨色      #16211B
字体      "Helvetica Neue", Arial, sans-serif
源码      stinger.html?layout=vert
成片      out/stinger-vertical.mp4
预览      out/stinger-vertical.gif（540×960 / 25fps / 4.0 MB）
```

---

## 一、为什么它不卡

三条硬约束，缺一条就会有顿感——这是这版跟之前那版唯一的区别。

**1 · 全程没有一次「高速硬停」。**
每一段运动结束都走阻尼弹簧，位置在目标值附近衰减振荡，不是按幂函数冲到终点然后速度瞬间归零。幂函数缓动（`easeOutCubic` 之类）末速度不为零，停的那一帧就是断崖。

**2 · 速度和位置都是连续的。**
收束不是从静止突然加速，而是先用 0.12 秒二次加速把速度提到 0.55（对数尺度/秒），再交给弹簧，弹簧的初速和初位与交接点严格相等。视觉上是「吸一口气再被拽走」，不是一个愣神。

**3 · 高速段有真运动模糊。**
按瞬时速度决定子帧数，最多 6 个子帧做 running average——数学上等价于快门积分（第 k 个子帧权重 1/(k+1)）。快门开角只有 36°，因为径向模糊作用在密集网格上会糊成一锅热浪。

弹簧公式（解析解，可任意 t 采样，这是逐帧导出能稳定的前提）：

```js
function spr(p, from, to, zeta, omega, v0 = 0) {
  if (p <= 0) return from;
  const d0 = from - to;
  if (zeta >= 1) {                        // 临界/过阻尼
    const e = Math.exp(-omega * p);
    return to + e * (d0 + (v0 + omega * d0) * p);
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const B = (v0 + zeta * omega * d0) / wd;
  return to + Math.exp(-zeta * omega * p) * (d0 * Math.cos(wd * p) + B * Math.sin(wd * p));
}
```

参数含义：`zeta` 阻尼比（<1 才回弹，0.6 明显，0.8 收敛），`omega` 固有角频率（越大越快），`v0` 初速。

---

## 二、时间轴

| 时间 | 事件 | 曲线 |
|---|---|---|
| 0.00–0.55 | 满幅商品墙，匀速上浮 60px | 线性 |
| 0.30–0.42 | 预推：缩放 1 → 1.0335（吸气） | `exp(A·d²)`，A = 0.55/0.24 |
| 0.30–0.72 | 旋转 0 → −22° | `eInOutS`（两端速度为 0） |
| 0.42–1.05 | 收束：缩放 1.0335 → 0.168 | 弹簧 ζ0.62 ω10 v₀0.55 |
| 0.52–1.05 | 收束绿光晕，半径 812 → 267 | `eOutC`，透明度峰值 0.09 |
| 0.72–1.10 | 转回 0，过冲 +1.8° | 弹簧 ζ0.62 ω10 |
| 0.84–1.10 | 绿环自缺口上端顺时针描出 | `eOutC`，半径弹簧 ζ0.78 ω12 |
| 1.02–1.10 | 商品盘溶解（80ms） | 线性 |
| 1.12–1.48 | 字母 e 弹入 0.74 → 1，过冲 14.8% | 弹簧 ζ0.52 ω15 |
| 1.12–1.48 | 涟漪扩散 R×0.60 → R×1.95，淡出 | `eOutC` |
| 1.36–1.62 | 字标横向擦除 + 上浮 16px | `eOutC` + 弹簧 ζ0.55 ω13 |
| 1.54–1.75 | slogan 三个词块错峰 55ms 落位，各上浮 18px | 弹簧 ζ0.50 ω14 |
| 1.70–2.30 | 定格，整体 0.32% 呼吸 | 正弦，周期 4.19s |

`eInOutS(p) = -(cos(πp) - 1) / 2`。旋转到极值必须用它——两端速度为零，否则拧到位的那一刻会「磕一下」。

---

## 三、几何

全部比例来自 `brand/mark.png` 实测（910px 原图，环外径 909、环厚 74、中线半径 417.5、内孔径 760），不是估的。

```js
const MCX = 540, MCY = 790;        // 标志中心（视觉重心，略低于画布中心）
const MD  = 470;                   // 标志外径
const R   = MD * 0.4588;           // 环中线半径 = 215.6
const STK = MD * 0.078;            // 环线宽     = 36.7
const GAP = 21.4 * Math.PI / 180;  // 缺口半角（视觉缺口 33°，圆头端帽各占 4.94°）
```

| 元素 | 位置 / 尺寸 |
|---|---|
| 标志中心 | (540, 790)，外径 470 |
| EPROLO 字标 | 宽 680，中心 y 1200（680/470 ≈ 横屏的 620/440，比例一致） |
| slogan | 字号 64，基线 y 1350，三块 `e` / ` for` / ` everything.` |
| 计数胶囊 | x 86, y 230，400 × 72，圆角全径，底色 `rgba(12,32,22,.92)` |

**商品墙。** 9 列 × 8 行，卡片 240 × 340，间距 16，整墙放大到短边 2260px 后居中绘制。圆形遮罩半径 1105 居中——1080×1920 的半对角是 1101.5，遮罩比画面大 3.5px，所以遮罩边缘永远在画面外，不会露出方形边。

> 竖屏比横屏窄，墙从 7×5 加密到 9×8。不加密的话横向只能看到三张半卡，撑不起「20 万商品」的体量感。

---

## 四、同一份源码出两种画幅

`stinger.html` 里只有一张 `LAYOUTS` 表，动画曲线和时间轴完全共用。这是竖屏版只花十几分钟的原因——不是重做，是换参数。

```js
const LAYOUTS = {
  land: { W: 1920, H: 1080, MCX: 960, MCY: 402, MD: 440,
          WORD_W: 620, WORD_Y: 736, SLOG_Y: 872, SLOG_SIZE: 58,
          GRID: { cols: 7, rows: 5, cw: 270, gap: 18 }, DRIFT: -50 },
  vert: { W: 1080, H: 1920, MCX: 540, MCY: 790, MD: 470,
          WORD_W: 680, WORD_Y: 1200, SLOG_Y: 1350, SLOG_SIZE: 64,
          GRID: { cols: 9, rows: 8, cw: 240, gap: 16 }, DRIFT: -60 }
};
```

不带参数打开时按窗口比例自动选：竖窗口给竖屏，横窗口给横屏。

| 画幅 | 入口 | 成片 |
|---|---|---|
| 1920×1080 | `stinger.html?layout=land` | `out/stinger.mp4` |
| 1080×1920 | `stinger.html?layout=vert` | `out/stinger-vertical.mp4` |
| 1080×1920 方图 | 改 `LAYOUTS` 新增一条 `1080×1080`，`GRID` 取 8×8 | — |

---

## 五、复现

```bash
node serve.js 8731                                    # 起本地服务

node export.js --page stinger.html --layout vert \
  --w 1080 --h 1920 --fps 60 --from 0 --to 2.30 \
  --out out/stinger-vertical.mp4

ffmpeg -y -i out/stinger-vertical.mp4 \
  -vf "fps=25,scale=540:-1:flags=lanczos,split[a][b];\
[a]palettegen=max_colors=256:stats_mode=diff[p];\
[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 out/stinger-vertical.gif
```

导出走 CDP 逐帧截图 + ffmpeg 管道，60fps 该片约 22 秒出片。**改了代码画面没变，先查 Chrome 缓存**——固定 `--user-data-dir` 会命中磁盘缓存，URL 上必须带 `&v=Date.now()`。

依赖资产：

```
brand/e-only.png     字母 e（透明底，910×910）
brand/wordmark.png   EPROLO 字标（透明底，730×153）
wall/w01..w16.png    16 张商品卡（206×292 截屏）
```

---

## 六、改哪里

| 想改 | 动这里 |
|---|---|
| 文案 | `slogan()` 里的 `parts` 数组；绿色高亮改 `cols` |
| 计数 | `content()` 里的 `'200,000+ products'` |
| 节奏变快 | `DUR` 同步缩短，`PRE0/PRE1` 前移，弹簧 `omega` 加 10–20% |
| 回弹更明显 | 弹簧 `zeta` 降到 0.5；更「紧」就升到 0.75 |
| 旋转角度 | `ROT_B`，超过 −35° 会把缺口转到侧边，注意别和字标打架 |
| 换商品图 | 替换 `wall/` 里同名文件，保持 206:292 比例 |
| 出方图 / 4:5 | 新增 `LAYOUTS` 一条，其余不动 |

---

## 七、文件

```
stinger.html                  动效源码（双画幅，唯一需要改的文件）
out/stinger-vertical.mp4      竖屏成片 1080×1920 / 2.30s / 60fps
out/stinger-vertical.gif      竖屏预览 540×960 / 25fps
out/stinger-vertical-sheet.png  12 格分镜
out/stinger.mp4               横屏成片 1920×1080（同源）
brand/                        矢量标志 + 字标 + 字母 e
wall/                         16 张商品卡
docs/motion-spec.md           更长的施工参数与历史决策
```

品牌矢量文件在 `brand/eprolo-ring.svg`、`brand/eprolo-mark.svg`，圆心 (468.5, 454.5)、中线 R 417.5、线宽 74、缺口端点 ±20.4°，与 PNG 逐像素差异 0.83%。
