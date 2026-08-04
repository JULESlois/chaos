# CHAOS 视觉修复：Boot Signal、直线代码雨、异常轨迹与字符变异

## 0. 工作范围

继续在当前分支工作：

```text
repository: JULESlois/chaos
branch: visual/rain-forms-tv-reveal
base: 当前分支最新 HEAD
```

Git 历史已经重写，不要依赖旧 SHA。

本轮只处理：

1. 初始横向信号线不可见。
2. 初始画面没有故障艺术闪动。
3. 代码雨从一开始就像弯曲的蛇。
4. 雨流之间仍显得规律、并排。
5. 字符没有形成明显的边下落边变异效果。
6. 字符集过少，并且 `ABCDEF` 过于规律。
7. Glyph Atlas 当前没有正确绘制和选择单个字符。

本轮不要修改：

* Three.js 电视；
* 电视相机；
* 电视按钮；
* 电视频道；
* 人脸、人形和手遮罩；
* 页面阶段数量；
* 路由与页面结构。

除非为了兼容新的雨流参数，不要修改上述系统。

---

# 1. 必须首先修复 Glyph Atlas

这是本轮最高优先级。

在字形映射和裁切正确前，不要进行字符集或雨流美术调参。

## 1.1 当前数据语义

`makeCharset()` 返回的是：

```ts
Uint8Array // 元素为 GLYPH_STRINGS 中的索引
```

它不是 Unicode code point。

因此禁止继续使用：

```ts
String.fromCharCode(this.charset[g])
```

正确字符应通过：

```ts
GLYPH_STRINGS[this.charset[g]]
```

获得。

修改 `GlyphAtlas`：

```ts
import { GLYPH_STRINGS } from '../charset';

const globalGlyphIndex = this.charset[localGlyphIndex]!;
const glyph = GLYPH_STRINGS[globalGlyphIndex]!;
ctx.fillText(glyph, ...);
```

## 1.2 Renderer 必须选择单个字形

当前 Atlas 每个 size/luminance entry 是一条横向图集。

`RainRenderer` 必须根据：

```ts
sample.glyph
```

选取对应 source rectangle。

正确调用形式：

```ts
ctx.drawImage(
  entry.canvas,
  sample.glyph * entry.cell,
  0,
  entry.cell,
  entry.cell,
  -entry.draw / 2,
  -entry.draw / 2,
  entry.draw,
  entry.draw,
);
```

不要继续执行：

```ts
ctx.drawImage(entry.canvas, ...)
```

直接绘制整张 Atlas。

明确字形索引语义：

```ts
RainGlyphSample.glyph
```

必须是：

```text
当前 Rain charset 内的局部索引
```

而不是全局 `GLYPHS` 索引。

## 1.3 Atlas 验证

增加开发页面：

```text
?lab=glyph-atlas
```

显示：

* 当前 Rain 字符集；
* 每个字符的实际绘制结果；
* 五档字号；
* 四档亮度；
* 每个字符的局部索引；
* 对应全局字形索引。

输出：

```text
artifacts/glyph-atlas-rain.png
```

截图中必须能够清楚看到所有配置字符，而不是控制字符、空白或整条图集。

## 1.4 Atlas 测试

增加测试：

1. charset 局部索引能映射到正确 `GLYPH_STRINGS`。
2. 第一个与最后一个字符的 source rectangle 不同。
3. Renderer 绘制 glyph 0 时只读取第一个 cell。
4. Renderer 绘制 glyph N 时读取第 N 个 cell。
5. 不调用 `String.fromCharCode(charsetIndex)`。
6. Atlas 截图中不同 glyph 的像素结果不同。

---

# 2. 重新定义页面前半段视觉节奏

新的运动结构：

```text
BOOT SIGNAL
→ STRAIGHT RAIN
→ INSTABILITY
→ ABERRANT PATHS
→ FORM
→ CHAOS
```

核心要求：

> 开场先建立“普通代码雨垂直下落”的视觉规则，用户继续下滑后，这套规则才突然发生异常。

不要让所有诡异效果从第一帧就存在。

---

# 3. 初始横向信号线

## 3.1 初始帧必须可见

页面加载后，不滚动时就必须看到横向信号线。

禁止：

```text
页面加载
→ 完全黑屏
→ 下滑后才出现内容
```

建议初始状态：

```text
横向位置：视口高度 50%–56%
宽度：视口宽度 72%–88%
可见格点：桌面至少 45 个
可见格点：移动端至少 24 个
```

`VOID_PRESET` 在 `progress = 0` 时：

```ts
weight >= 0.75
bootLineStrength >= 0.65
```

不要再从完全透明渐入。

## 3.2 横线由离散字符构成

横线不能是：

* Canvas stroke；
* CSS border；
* 单个长字符串；
* 连续矩形。

它必须由同一个 `RainField` 的各列雨头构成。

字符可以来自专用 Boot Pool：

```text
.  :  -  _  =  +  |  0  1  #  %
```

格点应存在：

* 少量空缺；
* 不同亮度；
* 1–3px 垂直误差；
* 少量双重影像；
* 局部水平偏移。

但整体仍应清楚读成“一条横线”。

## 3.3 修复当前不可见问题

不要用同一个正弦值同时控制：

```text
brightness
alpha
```

当前逻辑可能使二者同时接近零。

拆开：

```ts
const visibility = bootLineStrength * weight;
const luminanceFlicker = ...;
alpha = visibility * stableAlpha;
brightness = baseBrightness * luminanceFlicker;
```

要求：

* 闪烁主要改变亮度；
* 不应让整条线频繁完全透明；
* `alpha` 下限建议保持在 `0.22–0.35`；
* 只有明确的故障事件才可以让局部消失。

---

# 4. Boot 阶段的故障艺术闪动

当前平滑正弦闪烁不足以形成故障艺术。

增加确定性的 Boot Fault Scheduler。

```ts
interface BootFaultEvent {
  type:
    | 'segment-blackout'
    | 'segment-shift'
    | 'duplicate-line'
    | 'brightness-pulse'
    | 'glyph-scramble'
    | 'sync-tear';

  start: number;
  duration: number;
  columnStart: number;
  columnEnd: number;
  magnitude: number;
}
```

事件由固定 seed 生成。

不要每帧重新随机。

## 4.1 故障类型

### Segment Blackout

连续 3–14 个格点短暂消失。

持续：

```text
40–180ms
```

### Segment Shift

一小段格点水平偏移：

```text
±1–4 个 cell
```

随后立即恢复。

### Duplicate Line

横线局部出现一条上下偏移的残影：

```text
y offset: 2–8px
alpha: 0.12–0.38
```

### Brightness Pulse

少量连续格点突然高亮，再快速衰减。

### Glyph Scramble

一段格点快速更换字符，但位置不变。

### Sync Tear

整条线的某个短区间发生错位，持续不超过 120ms。

## 4.2 故障节奏

初始静止时也应发生故障。

建议：

```text
每 0.8–2.4 秒发生一次轻故障
每 4–8 秒发生一次明显故障
```

不要持续高频闪烁。

避免对光敏用户不友好的全屏亮度闪变。

---

# 5. 横线下坠为普通直线代码雨

用户开始下滑后，横线上的格点逐列释放。

每列仍使用既有：

```ts
releaseAt
releaseDuration
```

但必须修正以下问题：

* `releaseStrength` 当前不得只存在于配置而没有进入位置计算；
* release 应明确控制横线坐标到雨头坐标的混合；
* 未释放列保持在线上；
* 已释放列先形成直线雨流；
* 不能一释放就开始蛇形漂移。

正确计算：

```ts
const release =
  releaseStrength *
  smoothstep(releaseAt, releaseAt + releaseDuration, bootProgress);

displayHeadY = mix(bootLineY, simulatedHeadY, release);
```

## 5.1 雨尾生长

释放初期：

```text
1 个字符
→ 2–4 个字符
→ 5–10 个字符
→ 完整雨尾
```

雨尾长度增长必须与 release 绑定：

```ts
trailLength =
  mix(1, baseTrailLength, trailGrowth * release);
```

不要让格点一离开横线就瞬间带出完整长尾。

## 5.2 进入 CURRENT 时连续

进入 CURRENT 时：

* 不重置雨头；
* 不重新 populate；
* 不重新生成 glyph phase；
* 不重置字符 tick；
* 少量最后释放的列可以继续下坠；
* 横线残影在 CURRENT 最初 8%–12% 内消失。

---

# 6. CURRENT 前半段必须是普通直线代码雨

CURRENT 的前半段建立视觉规则。

建议：

```text
CURRENT 0.00–0.38
主要是垂直直线代码雨

CURRENT 0.38–0.50
出现少量异常预兆

CURRENT 0.50–0.64
轨迹快速失稳

CURRENT 0.64–1.00
形成诡异轨迹
```

## 6.1 直线阶段

在 `CURRENT 0.00–0.38`：

```ts
trajectoryDistortion = 0;
```

此时：

* `driftAmplitude` 不参与 x；
* `curveSlope` 不参与 x；
* 字符 rotation 接近 0；
* 绝大多数雨流向下；
* x 只包含小于 `0.18 cell` 的稳定 lane jitter；
* 每列可以有不同速度、长度、字号和间距；
* 但轨迹必须清楚是垂直坠落。

不要把“普通代码雨”理解为所有列完全相同。

普通阶段仍需要：

* 不同速度；
* 不同长度；
* 不同起始位置；
* 不同亮度；
* 不同字符变化频率；
* 不规则空缺。

## 6.2 异常转折

在 `CURRENT 0.50–0.64` 之间发生明显转折。

不要从一开始平滑增加轻微弯曲。

建议使用较陡的曲线：

```ts
trajectoryDistortion =
  smootherstep(0.48, 0.62, localProgress);
```

用户应该感受到：

```text
代码雨正常下落
→ 某几条首先偏离
→ 邻近雨流出现错误方向
→ 整体规律突然崩坏
```

---

# 7. 不要让所有雨流都变成同一种蛇

当前所有列都使用类似：

```ts
sin(time * frequency + phase)
+
row * curveSlope
```

即使参数不同，运动语法仍然相同。

改为每列稳定选择一种轨迹类型。

```ts
type TrajectoryType =
  | 'straight'
  | 'drift'
  | 'sine'
  | 'kink'
  | 'hook'
  | 'broken'
  | 'reverse-fragment';
```

建议异常阶段分布：

```text
straight          38%
drift             22%
sine              14%
kink              10%
hook               7%
broken             6%
reverse-fragment   3%
```

即使进入异常阶段，也要保留大量近似直线雨流。

## 7.1 各轨迹含义

### Straight

维持近似垂直，只产生极轻微左右漂移。

### Drift

整条流缓慢向一侧移动，但不弯成波浪。

### Sine

使用正弦曲线，但振幅、波长和相位独立。

### Kink

雨流在一个高度位置发生一次折角。

不是连续弯曲。

### Hook

尾部或头部局部弯折，不能整条都呈 S 形。

### Broken

雨流分成两三个位置不完全对齐的片段。

### Reverse Fragment

只有局部短片段向上运动，不能整列永久反向。

## 7.2 轨迹函数

不要让水平偏移只依赖：

```ts
row - rows / 2
```

因为这会让整条长尾形成统一斜线。

轨迹应使用雨流自身的归一化尾部位置：

```ts
trailU = trailIndex / max(1, trailLength - 1);
```

然后：

```ts
xOffset = trajectory.sample(
  trailU,
  time,
  localProgress,
  streamParameters,
);
```

这样可以让：

* 头部直、尾部弯；
* 中间发生折角；
* 只有局部片段错位；
* 不再全部像连续长蛇。

---

# 8. 扩展字符集并删除 ABCDEF

Rain 字符集不得继续使用：

```text
A B C D E F
```

不要用其他连续字母代替。

## 8.1 新字符组

使用以下分组。

### 微小标点

```text
. , : ; ' " `
```

### 方向与结构

```text
| / \ - _ = + ~ ^ < >
```

### 括号

```text
( ) [ ] { }
```

### 数字

```text
0 1 2 3 4 5 6 7 8 9
```

### 信号符号

```text
! ? @ # $ % & *
```

### 可选扩展符号

仅在字体可靠支持时加入：

```text
· ¦ × ÷ ± ╱ ╲
```

不要加入大面积实心块。

不要让：

```text
█ ▓ ▒ ░
```

成为普通代码雨主体。

这些字符只允许在 CHAOS 极少量出现。

## 8.2 全局字形表

确保 `GLYPHS` 包含 Rain Pool 中的全部字符。

字符不能重复依赖字符串中的重复次数实现权重。

建立显式权重：

```ts
interface WeightedGlyphGroup {
  charset: Uint8Array;
  weight: number;
}
```

推荐：

```text
微小标点       32%
方向与结构     28%
数字           20%
括号           10%
信号符号        8%
扩展符号        2%
```

普通阶段以标点和线条为主。

异常阶段可以逐步增加：

* 括号；
* 信号符号；
* 扩展符号。

---

# 9. 字符必须边下落边独立变化

字符变化不能只在雨流生成时决定。

每个可见字符应根据：

```text
stream
trailIndex
time tick
seed
```

独立变化。

推荐：

```ts
const holdDuration = mix(
  streamMutationMin,
  streamMutationMax,
  stableHash(column, trailIndex),
);

const tick = Math.floor(
  (time + glyphPhase) / holdDuration,
);

const glyph = weightedGlyph(
  seed,
  column,
  trailIndex,
  tick,
  sceneState,
);
```

## 9.1 保持时间

建议：

```text
快速变化字符：50–110ms
普通字符：120–320ms
缓慢字符：350–900ms
近乎静止字符：1–3 秒
```

分布：

```text
快速 15%
普通 55%
缓慢 25%
近乎静止 5%
```

## 9.2 不同步要求

必须保证：

* 相邻字符不同时变化；
* 同一列不整列同时变化；
* 相邻列不共享同一 tick；
* 头部不一定是变化最快的字符；
* 某些字符在下落过程中连续变化多次；
* 某些字符保持不变直至离开屏幕。

## 9.3 场景影响

普通直线阶段：

* 字符变化明显但稳定；
* 不出现高频全屏乱码。

异常阶段：

* 局部 mutation rate 增加；
* 某些片段短暂停止变化；
* 某些片段在两个字符间来回切换；
* 形态区域的字符变化稍微减慢，以保证形态可读。

CHAOS：

* 可以发生错误字符组替换；
* 但不能每帧全场随机。

---

# 10. 字号随机性

普通直线雨阶段也可以拥有字号差异，但需要克制。

建议：

```text
8–10px    28%
11–13px   48%
14–17px   19%
18–22px    5%
```

同一雨流内部：

* base size 由 stream 决定；
* 单字符允许 ±8%–18% 偏差；
* 不要每帧改变字号；
* 字号由稳定 hash 决定；
* 大字符不能每列都有。

进入异常阶段后：

* 局部字符可以短暂拉伸；
* 某些字符突然比同列其他字符大；
* 但变化必须持续一段时间，不得逐帧抖动。

---

# 11. Boot 到异常轨迹的参数接口

扩展 `RainParams`：

```ts
interface RainParams {
  weight: number;

  bootProgress: number;
  bootLineStrength: number;
  releaseStrength: number;
  trailGrowth: number;

  trajectoryDistortion: number;
  trajectoryAnomaly: number;
  mutationIntensity: number;
  glyphPoolMix: number;

  formWeights: FormWeights;
  chaos: ChaosFaults;
}
```

所有 Preset 必须完整写入这些字段。

推荐：

```text
VOID:
  trajectoryDistortion = 0
  trajectoryAnomaly = 0
  mutationIntensity = 0.25

CURRENT 前半:
  trajectoryDistortion = 0
  trajectoryAnomaly = 0
  mutationIntensity = 0.45

CURRENT 后半:
  trajectoryDistortion 迅速升至 1
  trajectoryAnomaly 升至 0.65
  mutationIntensity 升至 0.7

FORM:
  trajectoryDistortion 保持
  形态区域局部降低随机偏移

CHAOS:
  trajectoryAnomaly 接近 1
  mutationIntensity 根据事件变化
```

---

# 12. Visual Lab

扩展：

```text
?lab=boot
?lab=rain
?lab=glyph-atlas
```

## Boot Lab

支持：

* boot progress；
* line alpha；
* fault intensity；
* release strength；
* trail growth；
* 固定时间；
* 固定 seed。

## Rain Lab

支持：

* scene local progress；
* trajectory distortion；
* trajectory type 分布；
* mutation intensity；
* glyph group 权重；
* size distribution；
* speed distribution；
* 显示 trajectory type 调试颜色，仅限 debug。

## Atlas Lab

支持：

* 字符列表；
* 字符局部索引；
* 字符全局索引；
* 五档字号；
* 四档亮度；
* 单字符 source rectangle。

---

# 13. 视觉产物

输出：

```text
artifacts/boot-visible-00.png
artifacts/boot-glitch.png
artifacts/boot-release-40.png
artifacts/boot-release-80.png
artifacts/boot-to-rain.webm

artifacts/rain-straight.png
artifacts/rain-instability.png
artifacts/rain-aberrant.png
artifacts/rain-transition.webm

artifacts/rain-glyph-mutation.webm
artifacts/glyph-atlas-rain.png
artifacts/rain-mobile-straight.png
artifacts/rain-mobile-aberrant.png
```

## 视频验收

`boot-to-rain.webm` 必须显示：

```text
横线已存在
→ 局部故障闪动
→ 格点逐列坠落
→ 雨尾生长
→ 普通直线代码雨
```

`rain-transition.webm` 必须显示：

```text
直线下落
→ 少量雨流偏离
→ 短时间内规律崩坏
→ 多种诡异轨迹并存
```

`rain-glyph-mutation.webm` 必须清楚显示：

* 字符在下落过程中变化；
* 同一列字符不同步；
* 相邻列不同步；
* 没有 ABCDEF 连续序列。

---

# 14. 测试要求

## Atlas

* charset index 正确映射到 `GLYPH_STRINGS`；
* drawImage 使用单 glyph source rect；
* 不会绘制整张 Atlas；
* 每个 glyph 的 source x 正确；
* glyph 0 和 glyph N 输出不同。

## Boot

* progress 0 时存在可见格点；
* 初始可见格点数量达到最低要求；
* 初始 y 标准差足够小，可读成横线；
* fault 事件期间只有指定区间受影响；
* release 前字符保持在线上；
* release 后位置连续；
* 使用同一个 RainField。

## 直线到异常

* CURRENT 前段横向偏移低于阈值；
* CURRENT 后段横向偏移显著提高；
* 前段大多数轨迹为 straight；
* 后段至少出现四种轨迹类型；
* 仍有一定比例直线雨流；
* 同 seed 分布稳定。

## 字符变化

* Rain charset 不包含 A–Z；
* 同一个字符在多个 tick 后可以变化；
* 相邻字符 tick 不完全相同；
* 同列字符不会整列同时变化；
* 字符选择遵守权重；
* 不同 seed 产生不同序列；
* 固定 seed 可复现。

---

# 15. 禁止项

不要：

* 继续在错误 Atlas 上调字符；
* 使用 `String.fromCharCode(charsetIndex)`；
* 每个字符绘制整张 Atlas；
* 让开屏保持全黑；
* 只用正弦透明度模拟故障；
* 让代码雨从第一帧就弯曲；
* 让所有雨流使用同一种正弦轨迹；
* 用更大的 curveSlope 增强混乱；
* 用 ABCDEF 或其他连续字母；
* 每帧调用 `Math.random()`；
* 让字符整列同步变化；
* 通过高频全屏闪烁制造 Chaos；
* 修改电视系统；
* 修改人脸、人形和手的设计；
* 用测试通过代替视频证据。

---

# 16. 实施顺序

严格执行：

```text
1. 修复 GlyphAtlas 字符映射
2. 修复 RainRenderer 单 glyph 裁切
3. 输出 glyph-atlas-rain.png
4. 让 progress=0 的横线立即可见
5. 增加 Boot Fault Scheduler
6. 验证横线故障闪动
7. 接通 releaseStrength
8. 完成格点逐列下坠和雨尾生长
9. 建立普通直线代码雨状态
10. 增加 trajectoryDistortion 转折
11. 实现多种异常轨迹类型
12. 删除 Rain Pool 中的 ABCDEF
13. 增加字符组与权重
14. 实现独立字符 mutation tick
15. 输出桌面、移动端截图和视频
16. 运行 typecheck、lint、test、build
```

---

# 17. 最低验收标准

只有同时满足以下条件才算完成：

1. 页面初始状态能看到横向字符线。
2. 不滚动时横线也会发生局部故障闪动。
3. 横线由 RainField 字符组成。
4. 格点能够逐列释放下坠。
5. 雨尾从短到长生长。
6. 进入 CURRENT 时雨场不重置。
7. CURRENT 前半段主要是普通直线代码雨。
8. CURRENT 后半段出现明显、快速的异常转折。
9. 异常阶段不是所有雨流都变成同一种蛇。
10. 至少有四种可辨识轨迹行为。
11. 异常阶段仍保留部分直线雨流。
12. 字符边下落边变化。
13. 同列字符变化不同步。
14. 相邻列字符变化不同步。
15. Rain 字符集不包含 ABCDEF。
16. 字符集包含标点、方向符号、数字、括号和信号符号。
17. Glyph Atlas 正确绘制配置字符。
18. RainRenderer 只绘制指定单字符。
19. 桌面和移动端均有实际截图。
20. Boot、轨迹转折和字符变异均有实际 WebM。
21. TypeScript、Lint、测试和构建通过。
22. 电视相关文件没有非必要修改。

---

# 18. 最终报告格式

```text
## Glyph Atlas 修复

## 单字符裁切

## Boot Signal 可见性

## Boot 故障事件

## 格点释放与雨尾生长

## 普通直线代码雨

## 异常轨迹转折

## 轨迹类型分布

## Rain 字符集

## 字符独立变异

## 字号与速度分布

## 桌面与移动端

## 截图与视频

## 测试与构建

## 未解决问题
```

所有视觉完成声明必须引用实际截图或视频路径。
