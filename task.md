# CHAOS 修复任务：电视可靠显现、Boot Line 转场与非规则代码雨

## 任务列表

### 1. 电视可靠显现 (Three.js TV Reveal) [第一优先级]
- [x] 1.1 **重构 TVCanvas 挂载与 R3F 帧循环**
  - 条件挂载 `<TVCanvas>` (仅在 SILENCE/TELEVISION 且 active 时)
  - 强制使用 `frameloop="always"`，移除脆弱的 `invalidate()` 唤醒与一次性 rAF 逻辑
  - 卸载时彻底清理资源
- [x] 1.2 **统一电视透明度与可见性控制**
  - 移除 `.television` 父容器 CSS opacity transition 动画
  - 仅使用揭示进度 (reveal progress) 驱动 opacity 和 visibility，保证同一滚动位置画面唯一且严格可逆
- [x] 1.3 **CameraDirector 首帧渲染定位**
  - 第一帧直接使用当前 `progressRef.current` 初始化 smoothed 角度，平滑追赶，避免快速滚动到底部时电视不在屏幕内部
- [x] 1.4 **增加 TV 可见性诊断与测试路由**
  - 扩展 `?lab=tv-reveal` 打印 active, mounted, camera target, opacity, TV state, buttons armed 等诊断参数
  - 增加 `?lab=tv-reveal&progress=0`, `0.5`, `1` 强置状态
- [x] 1.5 **自动化/浏览器级 TV 显现验证与截图录像**
  - 验证 WebGL Canvas 挂载及 opacity 渐变
  - 验证 3D Mesh 按钮 (Power, Prev, Next) 的交互与响应

---

### 2. Boot Line 开场转场
- [x] 2.1 **设计并绘制 Boot Line 信号线**
  - 初始深红黑背景，y 轴约 52% 视口高度处生成格点信号线
  - 格点选用 `.` `:` `-` `_` `+` `0` `1` 等字符，端点稀疏，独立闪烁，少数点上下偏移 1-4px
- [x] 2.2 **将 Boot Line 融入统一 RainField 驱动**
  - 给 `RainStream` / `RainEngine` 增加 `RainStreamBootState` (releaseAt, releaseDuration, lineOffsetY, lineJitterX, flickerPhase, flickerRate)
  - 在 VOID 阶段将雨头约束在横线，随 VOID progress 推进按 `releaseAt` 逐列下坠转变成代码雨
  - 保证 VOID -> CURRENT 过程无二次重置、无坐标跳变
- [x] 2.3 **定义开场时间线与 VOID_PRESET**
  - VOID 0.00-0.18: 少量格点闪烁
  - VOID 0.18-0.42: 格点亮起连成横向信号线
  - VOID 0.42-0.62: 局部格点偏移
  - VOID 0.62-0.86: 逐列释放形成雨流
  - VOID 0.86-1.00: 横线残影消退，代码雨全面建立
- [x] 2.4 **生成 Boot Line 验证**

---

### 3. 代码雨不规则性与动态增强
- [x] 3.1 **扩展 TypedArray 列级视觉状态 (RainStreamVisualState)**
  - 增加 laneOffset, driftAmplitude/Frequency/Phase, baseSize, sizeVariance, spacing, dropout, acceleration, burst, glyphClockRate
- [x] 3.2 **非严格并排与曲线/斜向漂移**
  - laneOffset (±0.35 cell), 缓慢漂移 (±0.4-1.8 cell), trail curve (±0.2-1.2 cell), 斜向 (-8°~+8°, 少数 -14°~+14°)
- [x] 3.3 **丰富速度与加速度包络**
  - 慢流 25% (2.5-6), 普通 55% (6-14), 快流 17% (14-25), 突发 3% (25-34) cells/s
  - 动态速度分层与按列差异
- [x] 3.4 **多阶字号与非均匀间距**
  - 字号覆盖 8-10px (远), 11-14px (主体), 15-19px (近), 20-28px (少数特大)
  - 间距 0.75-1.4 cell，不规则缺口与长短片段
- [x] 3.5 **字符独立更新时钟与加权字符集**
  - 每一字符拥有独立更新 tick (time * clockRate + phase + trailIndex * step)
  - 字符加权：标点/方向符, 数字, 字母, 高密度字符
- [x] 3.6 **尾迹衰减与亮度多样化**
  - 四种 envelope: sharp-head, soft-head, fragmented, uniform-dim
- [x] 3.7 **结构保持**
  - 形态区域 (Face, Figure, Hand) 内部平稳收敛，外围保持不规则高离散

---

### 4. 形态区域局部收敛与 CHAOS 结构保持
- [x] 4.1 **形态区域 (Face, Figure, Hand) 局部收敛**
  - 在 mask 内部适当降低漂移 (20%-45%), 提高亮度, 拖慢速度, 提高凝聚度, 外围保持高混乱度
- [x] 4.2 **CHAOS 结构事件持久化选择**
  - 采用 `ChaosSelection` 在事件开始时选列，事件持续期间保持列集合稳定

---

### 5. 验证、测试与产物提交
- [x] 5.1 **Visual Lab 增强**
  - 扩展 `?lab=rain`, `?lab=boot`, `?lab=tv-reveal` 参数与统计数据面板
- [x] 5.2 **单元测试与集成测试**
  - 运行 `npm run test`, `npm run lint`, `npm run build`
- [x] 5.3 **输出最终验收报告与成果物**
