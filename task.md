# Phosphor Imprint / 磷光压印 Specification & Task List

`RainField` 已经具备持续雨场、Glyph Atlas、形态调制和时间缓冲，适合继续扩展；但当前形态仍主要通过修改雨流速度、亮度和延迟显现，缺少一个能够**积累、保持、释放图案**的持久状态层。

## 核心结论

最适合这个项目的方案不是：

```text
代码雨粒子
→ 被吸到目标位置
→ 停止
→ 形成图案
```

而是：

```text
代码雨持续下落
→ 字符经过目标区域时留下“磷光残像”
→ 残像逐渐积累成图案
→ 图案持续被新的雨滴刷新
→ 图案边缘开始风化
→ 残像脱落并重新变成下坠字符
```

可以称为：

> **Phosphor Imprint / 磷光压印**

这比“磁力吸附”更符合当前世界观：图案像被异常信号烧进 CRT，而不是粒子系统突然拼出 Logo。

---

## 模块划分

```text
src/visuals/ascii/rain/shape/
├── shape-types.ts
├── shape-slots.ts
├── shape-imprint.ts
├── shape-erosion.ts
├── shape-transition.ts
└── sources/
    ├── text-source.ts
    ├── face-source.ts
    └── hand-source.ts
```

---

## 实施步骤

- [x] **Task 1: 创建 task.md 并整理 磷光压印 (Phosphor Imprint) 架构与类型**
- [x] **Task 2: 实现 ShapeSlots TypedArray 存储与预处理列索引 (Column Spatial Indexing)**
- [x] **Task 3: 实现 TextSource（Canvas 文本离屏采样 & 边缘/SDF/负空间提取）**
- [x] **Task 4: 实现 ShapeImprint 残像积累与刷新逻辑**
- [x] **Task 5: 实现 ShapeErosion 侵蚀与沙化下落衰减机制**
- [x] **Task 6: 实现 ShapeTransition 状态机与过渡阻尼控制**
- [x] **Task 7: 与 RainEngine / RainRenderer 整合并验证单词/图形的生成、保持与风化解体**
