# EPROLO 品牌与动效库

EPROLO 的标志素材、两条 canvas 动画的源码、以及把它们渲染成 MP4 的导出管线。
所有动画都是**单文件 HTML + Canvas**，不依赖任何前端框架，逐帧可复现。

| 作品 | 文件 | 规格 | 用途 |
|---|---|---|---|
| 品牌收束片 · 横屏 | `stinger.html?layout=land` | 2.30s / 60fps / 1920×1080 | 片头、片尾、官网开屏 |
| 品牌收束片 · 竖屏 | `stinger.html?layout=vert` | 2.30s / 60fps / 1080×1920 | 抖音、Reels、Shorts |
| 30 秒宣传片 | `index.html` | 30.03s / 30fps / 1920×1080 | 官网、投流、展台循环 |

两种画幅共用一份源码，动画曲线与时间轴完全一致，只有 `LAYOUTS` 表不同。
**要改动着动效，先读 [`motion.md`](motion.md)**——那是规格本身，参数是确定性的。
成片在 `out/`，矢量标志在 `brand/`，实现记录在 `docs/`。

---

## 备份到 GitHub

本机 `github.com` 与 `ssh.github.com` 均不可达（网络层拦截），`git push` 走不通；
`api.github.com` 正常。所以用 `push.js` 直接调 Git Data API（blobs → tree → commit → ref），
建库、提交、推分支一次做完。

```bash
node push.js --check --token ghp_xxx     # 自检：账号、权限、仓库是否存在
node push.js --token ghp_xxx             # 推（默认 public，加 --private 建私有库）
```

token 需要：经典 token 勾 `repo` 整块；细粒度 token 需要 `Administration` + `Contents` 读写。
token 只在进程内存里用，不落盘。

---

## 快速开始

需要 Node 18+、Chrome、ffmpeg（都在 PATH 里）。

```bash
# 1. 起本地服务（必须走 http，file:// 会被 canvas 的跨域限制挡住）
node serve.js 8731

# 2. 浏览器打开预览
#    http://127.0.0.1:8731/stinger.html
#    http://127.0.0.1:8731/index.html
#    任何页面加 ?still=1.20 可以定格看某一帧

# 3. 导出成片
node export.js --page stinger.html --layout land --fps 60 --from 0 --to 2.30 --crf 15 --out out/stinger.mp4
node export.js --page stinger.html --layout vert --w 1080 --h 1920 --fps 60 --from 0 --to 2.30 --out out/stinger-vertical.mp4
node export.js --page index.html  --fps 30 --from 0 --to 30.033 --crf 16 --out out/eprolo-30s.mp4

# 4. 抽帧检查（输出到 out/shots/t<时间>.png）
node shot.js stinger.html 0.5 1.0 1.9
```

`export.js` 全部参数：`--page --fps --from --to --crf --out --limit`。
`--limit 20` 只渲 20 帧，用来快速验证改动，别每次全片跑。

Chrome 不在默认路径时用环境变量覆盖：`CHROME=/path/to/chrome node export.js ...`

---

## 目录

```
index.html            30s 主片
stinger.html          2.3s 品牌收束片
serve.js              静态服务（带 Range，视频可拖进度）
export.js             逐帧导出（CDP → ffmpeg）
shot.js               定点抽帧
brand/                标志素材 + 几何规范（见 brand/README.md）
assets/               商品图、平台图标、贴牌模板
wall/                 16 张真实商品卡（从后台录屏裁切）
panels/               后台整屏截帧（早期方案用，保留备用）
out/                  成片与缩略图
docs/
  motion-spec.md      当前规格：时间轴、弹簧参数、几何常量
  build-log.md        逐版实现记录与踩坑（写新版本前先读）
  asset-inventory.md  每个素材的来源与可用性
archive/              废弃版本，仅作对照
```

---

## 两个动画的核心差异

**`index.html`（30s）** 是叙事片：10 个段落，每段一个卖点，靠剪辑节奏推进。
段落表见 `docs/motion-spec.md`，改文案改 `sXxx(t)` 函数里的 `text()` 调用即可。

**`stinger.html`（2.3s）** 是收束片：满屏商品 → 圆形收拢 → 落进环口 → 字母 e 弹出 → 字标展开 → `e for everything.`
它的难点全在"运动是否连续"，与内容无关。三个必须守住的点：

1. **缩放走对数空间**。1.0 → 0.168 是 6 倍，线性插值会让前 60% 看着不动、最后两帧突然消失。
2. **交接点的速度必须连续**。弹簧从静止起步时，初加速度 = ω²×行程，前一帧不动、两帧后全速，眼睛读成"卡"。所以先有一段 `exp(A·d²)` 的预推把速度从 0 提到 0.55，再交给弹簧。
3. **遮罩圆必须内切商品墙**。把墙放大到 2260px、用半径 1105 的圆去裁：s=1 时遮罩看不见（仍是满幅），s 一降四角先被切掉，全程没有"浮在空中的矩形"阶段。

这三条只要错一条，成片就会显得廉价，而且很难从画面反推原因。细节见 `docs/build-log.md`。

---

## 要改成别的片子

| 想改什么 | 改哪里 |
|---|---|
| 文案 | 搜 `text('` 找到对应字符串 |
| 总时长 | `stinger.html` 的 `DUR`；`index.html` 的段落表 |
| 回弹强弱 | 阻尼比 `ζ`（0.52 弹更久，0.8 几乎不弹） |
| 运动快慢 | 刚度 `ω`（10 → 13 更急更硬） |
| 颜色 | `GREEN` / `INK` / `BG` 三个常量 |
| 换商品图 | 替换 `wall/w01..16.png`（206×292），或改 `WALL_SRC` 数组 |

品牌色只有三个值，别自己在样式里调：

```
品牌绿 #31CB49
墨色   #16211B
底色   #FAFBF9
```

---

## 已知缺口

- **字母 e 没有矢量版**。环已经重画成 SVG（`brand/eprolo-ring.svg`，纯路径、可无限缩放），字母是内嵌位图。要真正的全矢量，得找设计要 AI/EPS 源文件。
- **22–27s 的贴牌段是代码绘制的占位图形**，等盒子/吊牌/感谢卡的实物拍摄。
- **后台素材只有一段录屏**，16 张商品卡里几个品会重复出现。滚动时看不出来，停住那帧细看能发现。
- 30s 主片是**无声**的。音乐和音效留给 Resolve。

---

## 版本

`v2` — 2026-11-26。修掉"动效卡顿"（真因是运动不连续，不是丢帧），重做后台段为商品墙下滑，新增矢量标志。
`v1` — 2026-11-25。首版 30s 成片。旧收束片留在 `archive/stinger-v1.html`。
