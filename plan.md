# AI 小说创作平台 —— 极致详细执行方案

## Context（为什么做这件事）

现状：`novelcreater`（master 分支）是一个**架构野心很大、骨架完整、但核心能力是空壳**的 AI 辅助写作工具。已验证 `npm run build` 通过（TS strict，20 路由）。核心问题有三类：

1. **死代码 / 未接线**：`OutlineGenerator`、`ContentExpander`、`LanguagePolisher`、`MemoryManager` 四个引擎类从未被调用；`chunkText`、`chunkRepo.createMany`、`summaryRepo.upsert` 从未被调用。冷层向量检索读的是「永远没人写入」的表，导致 RAG 静默失效、「前情回顾」永远为空。
2. **路由割裂**：`/outline` `/characters` `/world` `/brainstorm`（扁平，各自下拉选小说、默认 `data[0]`）与 `/novel/[id]/*`（作用域）两套并存且不互通。`/novel/[id]/outline` 是对 `/outline` 的 2 行 re-export，**忽略 URL 的 `[id]`**（URL 撒谎）。`/novel/[id]/characters` 被 dashboard 链接但**文件不存在（404）**。无全局「当前小说」状态。
3. **无编排 / 无自动化**：每步靠人点；无「生成整本」runner；无流式（`max_tokens:4000` 整段等待，长章节被截断）；状态快照/伏笔表存在但无写入。

目标产出（本次仅交付**文档**，不写代码）：一份细到每个子功能点的执行方案，覆盖 小说创建 → 大纲 → 卷纲 → 章节细纲 → 章节内容生成 的完整链路 + 路由归一与内容传递优化 + 上述缺失能力的补齐。

**已确认的关键决策：**
- 路由架构：**全部归一到 `/novel/[id]/*`**，删除扁平路由与 re-export，novelId 走 URL，共享布局读当前小说。
- 自动化程度：**分阶段 + 人工确认关卡**（不做一键全自动）。
- 嵌入后端：**云端 embeddings API**（复用 provider 配置；规避 Windows 上 sharp/onnxruntime 原生编译失败）。

---

## 总体架构原则

1. **单一数据源**：novelId 唯一来源是 URL 路由参数（`/novel/[id]/...`）。不再有「下拉选小说 + data[0] 默认」。
2. **复用已写好的引擎类**：四个死代码引擎类（`OutlineGenerator` 等）已实现完整逻辑，**接线而非重写**。
3. **写时索引（write-time indexing）**：章节正文落库时，异步触发「分块 + 嵌入 + 摘要 + 向量写入」，盘活整个冷层 RAG。
4. **结构化生成**：大纲/细纲/状态/伏笔抽取统一走「JSON schema 约束 + 解析兜底」，替代目前脆弱的正则抠 JSON。
5. **分阶段编排**：每个生成阶段是独立可重试的 API + 前端关卡，阶段间数据持久化到 DB，支持「编辑后再进入下一步」。

---

## 阶段划分总览

- **P0 路由归一与内容传递**（地基，先做，避免后续重复改）
- **P1 小说创建全流程**
- **P2 大纲生成（主题 → 卷纲）**
- **P3 卷纲细化（卷 → 章）**
- **P4 章节细纲（章 → 场景）**
- **P5 章节内容生成（场景 → 正文）**
- **P6 写时索引层（分块/嵌入/摘要/向量）—— 盘活 RAG**
- **P7 缺失能力补齐（状态快照 / 伏笔 / 流式 / 记忆 / 加密 / 导出）**

---

## P0 — 路由归一与内容传递优化（地基）

### P0.1 目标路由结构（全部小说作用域）
```
/                              首页：小说列表（保留）
/novel/new                     新建小说向导（P1）
/novel/[id]                    小说仪表盘（保留，补全数据）
/novel/[id]/outline            大纲管理（卷/章树 + AI 生成关卡）
/novel/[id]/write              写作编辑器（保留，已是完整实现）
/novel/[id]/write?chapterId=x  定位到具体章节
/novel/[id]/characters         角色管理（新建文件，修复 404）
/novel/[id]/world              世界观
/novel/[id]/brainstorm         头脑风暴
/novel/[id]/settings           本小说的 AI/上下文设置（NovelSettings）
/settings                      全局：AI provider 配置（保留，非小说作用域）
```

### P0.2 删除 / 迁移清单
- **删除** `src/app/outline/page.tsx` → 内容迁移为 `src/app/novel/[id]/outline/page.tsx` 的真实实现（去掉 `<select>`，novelId 取 `useParams`）。
- **删除** `src/app/novel/[id]/outline/page.tsx` 现有的 2 行 re-export，替换为真实页面。
- **删除** `src/app/write/page.tsx`（19 行空 stub）。
- **删除** `src/app/characters/page.tsx`、`src/app/world/page.tsx`、`src/app/brainstorm/page.tsx` 的扁平版 → 迁移到 `/novel/[id]/...` 并去 `<select>`。
- **删除** 死代码组件 `src/components/editor/novel-editor.tsx`（未被任何文件 import，真实编辑器内联在 write/page.tsx）。
- **新建** `src/app/novel/[id]/characters/page.tsx`（修复 dashboard 链接 404）。
- **旧 URL 重定向**：在 `next.config.ts` 添加 redirects，将 `/outline` `/characters` `/world` `/brainstorm` `/write` 重定向到 `/`（读取 cookie `lastNovelId` 可进一步跳到 `/novel/${id}/outline`，作为增强）。避免用户书签 404。

### P0.3 共享小说作用域布局（核心：解决「当前小说」状态）
- **新建** `src/app/novel/[id]/layout.tsx`：
  - 服务端组件，用 `await params` 拿 `id`，`prisma.novel.findUnique` 校验存在（不存在 → `notFound()`）。
  - 渲染一个 `<NovelContextProvider value={{ novelId, novel }}>` 包裹 children。
  - 子页面通过 `useParams().id` 或 context 读 novelId——**不再各自 fetch 全部小说取 data[0]**。
- **新建** `src/lib/context-react/novel-context.tsx`：轻量 React Context（`createContext`），暴露 `useNovel()` hook 返回 `{ novelId, novel, refresh }`。当前项目**零全局状态**，这是第一个，刻意保持最小。

### P0.4 侧边栏修复（`src/components/layout/app-sidebar.tsx`）
现状：只有 Write 链接会用 `localStorage.lastNovelId` 改写 href，其余永远指向扁平路由。
- 改为：侧边栏读 `useParams().id`（在 `/novel/[id]/*` 下）或 `localStorage.lastNovelId` 兜底。
- **所有**小说相关导航项（大纲/角色/世界观/头脑风暴/设置）统一改写为 `/novel/${id}/...`。
- 当无 `id` 且无 `lastNovelId` 时，这些项指向 `/`（提示先选小说），而非扁平死路由。
- 修复 active 高亮：用 `pathname.includes('/outline')` 等子串匹配，兼容作用域 URL。

### P0.5 跳转与内容传递优化
- **全部 `<a href>` 改为 `<Link>`**：`outline/page.tsx:479` 的章节「写作」跳转目前是 `<a>`（整页刷新）→ 改 `next/link` 客户端跳转。
- **跳转携带上下文**：`大纲 → 写作` 跳转用 `?chapterId=`（已有），write 页用 `useSearchParams` 定位（已有，保留）。
- **生成关卡后的局部刷新**：生成大纲/细纲后用 `router.refresh()` + 乐观更新，避免整页 reload 丢失滚动位置。
- **「上次编辑章节」记忆**：write 页保存时写 `localStorage[`lastChapter:${novelId}`]`，dashboard 的「继续写作」按钮读它直接跳到该章。
- **面包屑**：在 `/novel/[id]/layout.tsx` 顶部加 `小说名 > 当前页面` 面包屑，点击可回仪表盘。

### P0.6 旧 URL 重定向
- **新建或修改** `next.config.ts`：
```ts
async redirects() {
  return [
    { source: '/outline', destination: '/', permanent: false },
    { source: '/characters', destination: '/', permanent: false },
    { source: '/world', destination: '/', permanent: false },
    { source: '/brainstorm', destination: '/', permanent: false },
    { source: '/write', destination: '/', permanent: false },
  ]
}
```
- 增强版：中间件读取 `req.cookies.get('lastNovelId')`，有值时跳转到对应 `/novel/[id]/outline` 等。

### P0.7 验证
- 从首页点小说 → dashboard → 大纲 → 角色 → 世界观，全程 URL 始终带同一 `novelId`，侧边栏高亮正确，无 404，无整页刷新闪烁。
- 访问旧的 `/outline` → 重定向到 `/`，不会 404。

---

## P1 — 小说创建全流程

### P1.1 入口与页面
- **新建** `src/app/novel/new/page.tsx`：分步向导（一页多 section，非多路由）。
- 首页 `src/app/page.tsx` 的「新建」按钮指向 `/novel/new`（现状是内联 dialog，可保留 dialog 作为快速创建，向导作为完整创建）。

### P1.2 子功能点（每个都是表单字段 → 落 `Novel` 表）
1. **基础信息**：`title`（必填）、`subtitle`（一句话简介）、`description`（详细简介）。
2. **类型标签** `genre`：多选 chips（玄幻/都市/科幻/悬疑…），存 JSON 数组字符串（API 已 `JSON.stringify`，list 端 `safeJsonParse`）。
3. **目标字数** `targetWords`：数字输入（默认 0，可选 30万/100万预设按钮）。
4. **叙事视角** `perspective`：单选 `first/third/omniscient`（影响 prompt 的 `perspectiveRule`，见 `prompts/builder.ts:119`）。
5. **时态** `tense`：单选 `past/present`。
6. **风格画像** `styleProfile`（可选）：自由文本，或「粘贴一段范文 → AI 提炼风格」（调 `/api/ai/generate` operation=`custom`）。
7. **初始 AI 设置**：选默认 provider + model（写入 `NovelSettings.defaultProviderId/defaultModel`）。

### P1.3 复用现有 API
- POST `/api/novels`（`src/app/api/novels/route.ts:40`）已支持 `title/subtitle/description/genre/targetWords/perspective/tense`，且**自动创建 `NovelSettings` 行**（route.ts:55）。
- **需扩展**：POST body 增加 `styleProfile`、`defaultProviderId`、`defaultModel` 透传（后两者更新 NovelSettings）。

### P1.4 创建后跳转
- 创建成功 → `router.push('/novel/${created.id}/outline')`（直接进入大纲，引导下一步），而非回首页。

### P1.5 验证
- 填写向导 → 提交 → DB 出现 Novel + NovelSettings 行 → 自动跳到该小说大纲页，URL 含新 id。

---

## P2 — 大纲生成（主题 → 卷纲）

### P2.1 核心改造：接线 `OutlineGenerator`（消灭前端内联实现）
现状：`outline/page.tsx:103` 的 `handleAIGenerateOutline` 在**前端内联**拼 prompt + `parseAIOutline` 抠 JSON，完全没用 `src/lib/context/outline-generator.ts`（死代码）。
- **新建** `src/app/api/novels/[id]/outline/generate/route.ts` (POST)：
  - body: `{ theme, genre?, targetLength?, stage: 'volume' }`
  - 内部实例化 `OutlineGenerator`，注入 `callAI`（复用共享调用器，见 P2.2）。
  - 调 `outlineGen.generateVolumeStructure(req)` → 返回 `VolumeStructure[]`。
  - **不直接落库**，返回结构供前端预览（关卡：用户确认后再落库）。

### P2.2 共享 AI 调用器（消除重复）
- **新建** `src/lib/ai/call.ts`：把 `generate/route.ts` 的 `selectModel`、`callAI`、`estimateTokens` 抽成可复用 `callAIChat(systemPrompt, userMessage, opts)` 与 `getActiveProvider()`。
- 这样 `OutlineGenerator` 的 `callAI:(prompt)=>Promise<string>`、`ContentExpander`/`LanguagePolisher` 的 `callAI:(sys,user)=>Promise<string>` 都由这一处适配。

### P2.3 子功能点
1. **主题输入**：多行 textarea（现状单行 input，改支持长设定）。
2. **参数**：卷数范围（3-5）、每卷章数（8-15）、总目标字数（带入 `Novel.targetWords`）。
3. **生成卷纲**：调 P2.1 接口 → 展示「卷标题 + 卷概要 + 章列表（标题/摘要/关键事件/出场角色/目标字数）」可编辑预览。
4. **关卡确认**：逐卷/逐章编辑标题与摘要 → 点「确认并保存」。
5. **落库**：确认后批量创建 `Volume` + `Chapter`。

### P2.4 落库优化（修复 sortOrder 问题）
现状 bug：`getNextSortOrder` 是**全小说范围**（chapters/route.ts:59），跨卷创建会乱序，move 只能同卷内交换。
- **新建** 批量落库接口 `POST /api/novels/[id]/outline/commit`：在一个 `$transaction` 内按「卷序 × 卷内章序」显式赋 `Volume.sortOrder`、`Chapter.sortOrder`（章序 = 卷序*1000 + 卷内序，全局有序且分卷段）。
- 替代现状 `createOutlineFromAI` 的串行 N 次 fetch（慢、无事务）。
- **上限**：此方案每卷最多 999 章（1000 会溢出到下一卷序段）。更稳健的方案是 `ORDER BY volume.sortOrder, chapter.sortOrder` 双字段排序，`move` 操作重算同卷内 sortOrder。

### P2.5 结构化输出加固
- `OutlineGenerator.parseVolumeResponse`（outline-generator.ts:169）已有兜底，保留。
- prompt 末尾强制「只输出 JSON」+ `callAIChat` 加可选 `responseFormat:'json'`（OpenAI 兼容 `response_format:{type:'json_object'}`，DeepSeek 支持）。

### P2.6 验证
- 输入主题 → 生成 → 预览 3-5 卷 → 编辑某章标题 → 确认 → DB 中 Volume/Chapter 按正确 sortOrder 落库 → 大纲树有序展示。

---

## P3 — 卷纲细化（卷 → 章）

> 说明：P2 一次生成「卷+章」骨架。P3 是对**单个卷**做更深的章级细化（补章、调整节奏、生成缺失章节摘要），独立于 P2 可反复触发。

### P3.1 子功能点
1. **单卷重生成章列表**：选中某卷 → 「AI 细化本卷」→ 基于卷概要 + 前后卷上下文，生成/补全本卷章节列表。
2. **卷概要编辑**：现状**无 volume PATCH 接口**（仅 POST/DELETE，见 volumes/route.ts）。
   - **新建** `PATCH /api/novels/[id]/volumes`（body `{ volumeId, title?, summary? }`）补齐编辑能力。
3. **章节插入/删除/移动**：复用 POST/DELETE chapters + move 接口。补一个「在某章后插入」入口（带 sortOrder 重排）。
4. **卷内节奏分析**（可选增强）：AI 检查本卷章节的冲突密度/情感曲线，给调整建议（operation=`brainstorm`）。

### P3.2 上下文注入
- 细化单卷时，把「全书卷纲 + 相邻卷概要 + 已有角色/世界观」注入 prompt，保证连贯（复用 `WarmContextCollector.collectAll*` 的全量注入逻辑，warm.ts:227+）。

### P3.3 验证
- 选中卷 → 编辑卷概要（PATCH 生效）→ AI 细化 → 章节列表更新 → sortOrder 仍有序。

---

## P4 — 章节细纲（章 → 场景）

### P4.1 核心改造：接线场景细纲并**持久化**
现状：`outline/page.tsx:155` 的 `handleAIGenerateChapterDetail` 生成的细纲只存在前端 `sceneOutlines` state（`useState` 内存），**刷新即丢失**，且只是纯文本不是结构化。

**设计决策：ChapterScene vs Chapter 树**：`Chapter` 已有 `parentId` 自引用（树形结构），`OutlineNode.type` 有 `'section'` 枚举。这里选择**独立 `ChapterScene` 表**而非复用 Chapter 树，因为：① 场景不可再嵌套，无需全树能力；② 场景有专属字段（setting/conflict/outcome/emotionalBeat）不想污染 Chapter 通用字段；③ 展开时按 `seq` 排序即可，不需要树遍历。

- **新增数据模型**：`prisma/schema.prisma` 增 `ChapterScene` 表（迁移）：
  ```
  model ChapterScene {
    id, chapterId, novelId, seq Int
    title, setting, characters(JSON), conflict, outcome,
    emotionalBeat, notes
    createdAt, updatedAt
    @@index([chapterId])
  }
  ```
  对应 `SceneDetail`（outline-generator.ts:26）的结构。
- **新建** `POST /api/novels/[id]/chapters/[chapterId]/scenes/generate`：实例化 `OutlineGenerator`，调 `generateSceneDetails(chapter, context)` → 返回 `SceneDetail[]`。
- **新建** `GET/POST/PATCH/DELETE /api/novels/[id]/chapters/[chapterId]/scenes`：CRUD 场景（落 `ChapterScene`）。

### P4.2 子功能点
1. **生成细纲**：点章节「细纲」→ AI 拆 3-6 场景（地点/角色/冲突/结果/情感节拍/备注）。
2. **结构化展示与编辑**：每个场景一张卡片，字段可编辑（替代现状的纯文本 `whitespace-pre-wrap` 展示）。
3. **场景增删改排序**：手动加场景、删场景、拖拽排序（seq 重排）。
4. **持久化**：确认后写 `ChapterScene`，刷新不丢；供 P5 内容生成读取。
5. **上下文注入**：生成细纲时注入「本章摘要 + 关键事件 + 出场角色档案 + 前一章结尾摘要」。

### P4.3 上下文构建
- 复用 `OutlineGenerator.generateSceneDetails(chapter, context)` 的 `context` 入参——由后端用 `ContextPipeline`/`WarmContextCollector` 组装角色+世界观+前情，而非空字符串。

### P4.4 验证
- 点「细纲」→ 生成 3-6 张场景卡 → 编辑某场景冲突 → 保存 → 刷新页面细纲仍在 → DB `ChapterScene` 有行。

---

## P5 — 章节内容生成（场景 → 正文）

### P5.1 核心改造：接线 `ContentExpander`（消灭前端内联展开）
现状：`outline/page.tsx:188` 的 `handleAIExpandContent` 在前端拼一个大 prompt 一次性 expand，没用 `ContentExpander`（死代码），无逐场景、无连续性检查。

**关键接口桥接**：`ContentExpander.expandChapter(scenes, context, opts)` 的 `context` 入参是 `string`，而 `ContextPipeline.assemble()` 返回的是 `AssembledContext`（含 systemPrompt + messages）。需要新加一个 `buildExpansionContext(novelId, chapterId): Promise<string>` 函数，内部复用 `WarmContextCollector` 的全量注入逻辑 + `ContextPipeline` 的热层采集，拼成纯文本字符串传入 expander。

- **新建** `POST /api/novels/[id]/chapters/[chapterId]/expand`：
  - 读该章 `ChapterScene[]`（P4 落库的场景）。
  - 实例化 `ContentExpander`（注入共享 `callAIChat`），调 `expandChapter(scenes, context, {targetWordsPerScene, perspective})`。
  - `ContentExpander.expandChapter`（content-expander.ts:61）**逐场景生成 + 相邻场景连续性检查**（已实现，checkContinuity content-expander.ts:177）。
  - 上下文 `context` 由 `buildExpansionContext()` 组装（角色/世界观/前文/RAG），拼成纯文本 string。
  - 返回 `{ content, wordCount, scenesGenerated, warnings }`。

### P5.2 子功能点
1. **整章展开**：点「展开」→ 逐场景生成 → 合并 → 写入 `Chapter.content`，状态置 `draft`。
2. **单场景展开/重写**：对单个场景调 `expandSingleScene`（content-expander.ts:116），结果插入正文对应位置。
3. **连续性警告展示**：把 `warnings`（时间线/状态/过渡矛盾）展示在 UI，供用户决定是否重写。
4. **字数控制**：`targetWordsPerScene` 由 `Chapter.targetWords / scenes.length` 推算。
5. **视角/时态**：从 `Novel.perspective/tense` 带入 `options.perspective`。
6. **展开后建索引**：写入 content 后触发 P6 写时索引（分块+嵌入+摘要）。
7. **无场景降级**：如果该章没有 `ChapterScene` 行（用户跳过 P4 直接展开，或旧数据迁移），降级为用 `Chapter.summary` 做单次 expand（复用现状 `handleAIExpandContent` 的 summary-based 逻辑），保证旧数据兼容。

### P5.3 与写作编辑器的衔接
- 展开完成 → 提供「去编辑器精修」按钮 → `<Link href={'/novel/${id}/write?chapterId=${chapterId}'}>`。
- 编辑器（write/page.tsx）已有 续写/润色/扩写，保留；润色可接 P7 的 `LanguagePolisher` 多轮精修。

### P5.4 流式输出（P7 联动）
- 长章节展开会超 `max_tokens:4000` 被截断。P5 接口设计为**支持流式**（SSE），见 P7.3。整章展开按场景流式回传，前端逐场景渲染进度。

### P5.5 验证
- 有细纲的章 → 点「展开」→ 逐场景进度可见 → 正文写入 DB，wordCount 更新 → 编辑器打开能看到内容 → `ChapterChunk` 表出现该章切片（P6）。

---

## P6 — 写时索引层（盘活 RAG，投入产出比最高）

> 这是把「读空表的冷层」变活的关键。当前 `chunkText`、`chunkRepo.createMany`、`summaryRepo.upsert`、向量写入**全部从未被调用**。

### P6.1 索引服务（核心新模块）
- **新建** `src/lib/context/indexer.ts`，导出 `indexChapter(novelId, chapterId)`：
  1. 读 `Chapter.content`，**剥 HTML**（content 是 TipTap HTML），得纯文本。
  2. **入口去重**：计算 `sha256(plainText)`，与上次索引的 hash 比较（可存在 `ChapterChunk` 表或独立 `index_log` 表）。hash 未变 → 直接返回，跳过后续所有步骤（解决自动保存每 1.5s 触发导致的冗余调用）。
  3. `chunkText(plainText)`（chunker.ts:34）→ `ChunkResult[]`（800字/块，100字重叠）。
  4. `chunkRepo.deleteByChapterId(chapterId)`（先清旧）→ `chunkRepo.createMany(...)` 落 `ChapterChunk`。
  5. `getEmbeddingService()` + `embed(chunks.map(c=>c.content))` 批量嵌入（**云端 provider**，见 P6.4）。
  6. `getVectorStore().ensureTable('chunk_vec', dims)` → `insert('chunk_vec', [{id, embedding}])` 用 `ChapterChunk.id` 对齐（hybrid-search.ts:85 靠 id join ChapterChunk）。
  7. 用 `EmbeddingCache`（cache.ts，单例已存在）做嵌入去重，避免同一文本重复调 embedding API。

### P6.2 摘要生成（盘活「前情回顾」）
- **新建** `src/lib/context/summarizer.ts`，导出 `summarizeChapter(novelId, chapterId)`：
  1. 用 `callAIChat` 生成三级摘要（oneLine ~30字 / brief ~150字 / detailed ~500字）。
  2. `summaryRepo.upsert(chapterId, {oneLineSummary, briefSummary, detailedSummary, briefEmbedding})`（summary-repo.ts:9）。
  3. brief 摘要嵌入后存 `briefEmbedding`（Uint8Array）。
- 盘活效果：`WarmContextCollector.collectRecentSummaries`（warm.ts:161）将真正返回「前情回顾」，不再恒空。

### P6.3 触发时机（显式触发，不阻塞保存）
> **重要**：Next.js API route 不支持 `fire-and-forget`（`return NextResponse.json()` 之后异步操作可能被平台打断）。采用**显式触发**模式。

- **触发方式 A（推荐）——前端显式调用**：
  1. 章节 PATCH 保存成功（前端收到 200）→ 前端调 `POST /api/novels/[id]/chapters/[chapterId]/index`。
  2. write 页自动保存每 1.5s 触发一次保存 → 前端在保存成功回调中检查 content hash 是否变化，变化时才调 index。
  3. P5 展开成功后 → 前端在收到 content 写入完成的响应后调 index。
- **触发方式 B（备选）——进程内去重队列**：
  - 后端维护一个 `Map<chapterId, Promise>`，`indexChapter` 推入队列，同一 chapterId 的重复调用复用同一个 Promise。
- **手动重建入口**：`POST /api/novels/[id]/reindex` 全书重建（用于历史数据补索引）。
- **防抖**：indexer 入口的 `sha256` 哈希去重（P6.1 第 2 步）作为最后防线。

### P6.4 云端嵌入配置（按你的决策）
- `EmbeddingService` 已支持 `provider:'openai'` 走 `embedOpenAI`（service.ts:115，OpenAI 兼容 `/embeddings`）。
- **嵌入 provider 独立于聊天 provider**：聊天 API 是 `/chat/completions`，嵌入 API 是 `/embeddings`。同一个 provider 可能只支持聊天不支持嵌入（如某些国产模型）。且嵌入模型名（如 `text-embedding-3-small`）与聊天模型名（如 `deepseek-v4-flash`）不同。
  - **方案**：在 `NovelSettings` 增加 `embeddingProviderId`（外键到 AIProvider）和 `embeddingModel`（字符串）字段。如果未配置，fallback 到 `defaultProvider` 的 baseUrl+apiKey 但 model 用独立配置。如果 provider 返回 404（不支持 `/embeddings`），降级为纯关键词检索（hybrid-search 的 keyword 分支仍可用）。
- `pipeline.ts:90` 现在硬编码本地路径 + 默认 local 模型——改为读 `NovelSettings` 选 provider 和 model。
- **规避 Windows sharp 问题**：`@xenova/transformers` 仅本地模式需要，云端模式不加载它，绕开原生编译失败。

### P6.5 修复 hybrid-search 作用域 bug
- 现状 `HybridSearch.search` 忽略 `retrievalScope/chapterId/volumeId`，只按 novelId 过滤（agent 已确认）。
- 按 `retrievalScope`（chapter/volume/novel/smart）真正过滤候选 chunk，提升相关性。

### P6.6 验证
- 写一章正文保存 → 等待几秒 → `ChapterChunk` 出现切片、`chunk_vec` 出现向量、`ChapterSummary` 出现三级摘要 → 在下一章写作时「前情回顾」非空、续写能检索到前文相关片段（debugInfo.coldContext 非空）。

---

## P7 — 缺失能力补齐

### P7.1 角色状态快照（CharacterStateSnapshot 表已存在，无写入）
- **新建** `src/lib/context/extractor.ts` 的 `extractStateSnapshots(novelId, chapterId)`：章节展开/保存后，用 `callAIChat`（JSON 输出）从正文抽取「每个出场角色的状态变化（位置/伤情/情绪/生死）」→ `stateRepo.create`（state-repo.ts:30）。
- 盘活效果：`WarmContextCollector` 的角色「当前状态」（warm.ts:129 `state?.state ?? '状态未知'`）将真实反映剧情。
- UI：角色页加「状态时间线」展示 `stateRepo.getHistory`。

### P7.2 伏笔管理（Foreshadowing 表已存在，无写入/无 UI）
- **新建** `POST/GET/PATCH /api/novels/[id]/foreshadowings`（复用 `foreshadowRepo`：create/findUnresolved/markClosed/markDiscarded，foreshadow-repo.ts）。
- **新建** `src/app/novel/[id]/foreshadowings/page.tsx`：埋设/计划回收/已回收/废弃 看板。
- **AI 抽取**：`extractor.ts` 的 `extractForeshadowings`——展开后识别「埋设的伏笔」自动建 Foreshadowing（status=planted）。
- 盘活效果：`WarmContextCollector.collectForeshadowReminders`（warm.ts:186）与 cold 层伏笔检索（cold.ts:99）真正工作，写作时提醒「该回收的伏笔」。

### P7.3 流式输出（SSE）
- **改造** `/api/ai/generate` 与 P5 expand 接口支持 `stream:true`：透传 OpenAI 兼容 `stream` 参数，用 `ReadableStream` + SSE 回传。
- 解决 `max_tokens:4000` 整段等待与长文截断；前端编辑器逐字渲染续写。
- `max_tokens` 改为按操作动态（续写 2000 / 整章展开按场景分批，不再单次 4000 硬上限）。

### P7.4 长期记忆（MemoryManager 接线）
- **新建** `src/lib/context/memory-singleton.ts`：用云端 embedding + vectorStore 实例化 `MemoryManager`（memory-manager.ts:57 需注入二者）。
- **初始化顺序**（向量维度取决于嵌入模型，须先确认）：
  1. `const embeddingService = getEmbeddingService({ provider: 'openai', ... })`
  2. `const dims = embeddingService.getDimensions()`（openai 1536 / local 512）
  3. `const vectorStore = getVectorStore()`
  4. `vectorStore.ensureTable('memory_vec', dims)`
  5. `const memoryManager = new MemoryManager(embeddingService, vectorStore)`
- 触发：章节展开后抽取「语义记忆（角色/设定/规则）+ 情景记忆（关键事件）」→ `memory.createFromChapter`（memory-manager.ts:108）。
- 检索：`ContextPipeline` 冷层增加 `memory.searchSemantic` 调用，注入 top 记忆。
- 衰减：定期 `decayMemories`（低重要度+低访问）。

### P7.5 语言润色（LanguagePolisher 接线）
- **新建** `POST /api/novels/[id]/chapters/[chapterId]/polish`：实例化 `LanguagePolisher`（注入 callAIChat），按 `getRecommendedOrder()`（grammar→show_dont_tell→dialogue→style→pacing→sensory）多轮精修。
- 编辑器润色按钮可选「单轮快润」或「多轮精修」。

### P7.6 一致性校验 agent
- **新建** `POST /api/novels/[id]/check`：跨章检查——角色状态矛盾（同一角色前死后活）、伏笔超期未回收、视角/时态漂移。结果展示为「问题清单」。
- **范围限定**（避免 O(n²) AI 调用）：
  - 默认检查范围：**最近 5 章 + 当前所有未回收伏笔**。
  - 全书深度检查为独立显式操作（标注耗时警告，如"预计需要 5-10 分钟"）。
  - 角色状态矛盾：只对比相邻章的 `CharacterStateSnapshot`（P7.1 产出），不逐章对全量。

### P7.7 安全加固
- **API Key 加密**：现状 `AIProvider.apiKey` 明文存库（schema 注释写「加密存储」但代码没做，providers/route.ts:21）。用 `node:crypto` AES-GCM + 环境变量密钥 `ENCRYPTION_KEY` 加密存储。
- **GET 脱敏**：返回 `sk-****...****` 格式（只显示前 3 后 4 字符），现状 `providers/route.ts:6` 直接返回完整 key。
- **PATCH 智能区分**：更新 provider 时，如果 apiKey 字段为脱敏格式（匹配 `****` 模式），视为「未修改」，沿用旧加密值；如果是非脱敏格式（新明文），加密后更新。避免用户不修改 key 时误覆盖。
- **访问鉴权**：所有 API 路由无鉴权。最小化加一层（单用户本地可用 env token；多用户需 session）。标注为「网络暴露前必须」。

### P7.8 导出
- **新建** `GET /api/novels/[id]/export?format=txt|md|epub`：按卷+章拼接，TXT/MD 直出；EPUB 用 `epub-gen` 类库。

### P7.9 验证
- 状态：展开一章 → 角色页状态时间线出现新快照。
- 伏笔：展开埋伏笔的章 → 伏笔看板出现 planted 项 → 后续章节写作时收到回收提醒。
- 流式：续写时文字逐步出现而非一次性。
- 导出：下载 TXT/MD/EPUB 内容完整有序。

---

## 文件改动地图（汇总）

### 新建文件
| 文件                                                         | 用途                                             | 阶段 |
| ------------------------------------------------------------ | ------------------------------------------------ | ---- |
| `src/lib/ai/call.ts`                                         | 共享 AI 调用器（callAIChat / getActiveProvider） | P2   |
| `src/lib/context-react/novel-context.tsx`                    | 「当前小说」React Context + useNovel()           | P0   |
| `src/app/novel/[id]/layout.tsx`                              | 小说作用域共享布局 + 面包屑                      | P0   |
| `src/lib/context/build-expansion-context.ts`                 | ContextPipeline→ContentExpander 上下文桥接       | P5   |
| `src/app/novel/[id]/characters/page.tsx`                     | 修复 404                                         | P0   |
| `src/app/novel/[id]/world/page.tsx`                          | 迁移自扁平路由                                   | P0   |
| `src/app/novel/[id]/brainstorm/page.tsx`                     | 迁移自扁平路由                                   | P0   |
| `src/app/novel/[id]/settings/page.tsx`                       | 本小说 AI/上下文设置                             | P0   |
| `src/app/novel/new/page.tsx`                                 | 创建向导                                         | P1   |
| `src/app/api/novels/[id]/outline/generate/route.ts`          | 接 OutlineGenerator                              | P2   |
| `src/app/api/novels/[id]/outline/commit/route.ts`            | 事务批量落库 + sortOrder 修复                    | P2   |
| `src/app/api/novels/[id]/chapters/[chapterId]/scenes/route.ts` | 场景 CRUD                                        | P4   |
| `src/app/api/novels/[id]/chapters/[chapterId]/scenes/generate/route.ts` | 接 generateSceneDetails                          | P4   |
| `src/app/api/novels/[id]/chapters/[chapterId]/expand/route.ts` | 接 ContentExpander                               | P5   |
| `src/app/api/novels/[id]/chapters/[chapterId]/index/route.ts` | 单章索引触发（P6.3 显式调用）                    | P6   |
| `src/app/api/novels/[id]/chapters/[chapterId]/polish/route.ts` | 接 LanguagePolisher                              | P7   |
| `src/lib/context/indexer.ts`                                 | 写时分块+嵌入+向量                               | P6   |
| `src/lib/context/summarizer.ts`                              | 三级摘要                                         | P6   |
| `src/lib/context/extractor.ts`                               | 状态/伏笔抽取                                    | P7   |
| `src/lib/context/memory-singleton.ts`                        | 接 MemoryManager                                 | P7   |
| `src/app/api/novels/[id]/foreshadowings/route.ts` + `foreshadowings/page.tsx` | 伏笔管理                                         | P7   |
| `src/app/api/novels/[id]/reindex/route.ts`                   | 全书重建索引                                     | P6   |
| `src/app/api/novels/[id]/check/route.ts`                     | 一致性校验                                       | P7   |
| `src/app/api/novels/[id]/export/route.ts`                    | 导出                                             | P7   |

### 修改文件
| 文件                                                    | 改动                                                         | 阶段     |
| ------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `src/components/layout/app-sidebar.tsx`                 | 全导航项作用域化 + active 高亮修复                           | P0       |
| `src/app/page.tsx`                                      | 新建按钮 → /novel/new；记忆 lastChapter                      | P0/P1    |
| `src/app/novel/[id]/page.tsx`                           | 修复 characters 链接；补「继续写作」跳转                     | P0       |
| `src/app/novel/[id]/outline/page.tsx`                   | 替换 re-export 为真实页（迁移 outline 逻辑，去 select，接 P2 接口） | P0/P2    |
| `src/app/novel/[id]/write/page.tsx`                     | `<a>`→`<Link>`；流式渲染；接多轮润色                         | P0/P5/P7 |
| `src/app/api/novels/route.ts`                           | POST 增 styleProfile/默认 provider                           | P1       |
| `src/app/api/novels/[id]/volumes/route.ts`              | 增 PATCH（卷编辑）                                           | P3       |
| `src/app/api/novels/[id]/chapters/[chapterId]/route.ts` | PATCH 后触发索引/摘要                                        | P6       |
| `src/app/api/ai/generate/route.ts`                      | 抽取共享调用器；支持 stream；透传 options                    | P2/P7    |
| `src/app/api/settings/providers/route.ts`               | apiKey 加密 + GET 脱敏                                       | P7       |
| `src/lib/context/pipeline.ts`                           | 嵌入改云端选 provider；接 memory 检索                        | P6/P7    |
| `src/lib/context/retriever/hybrid-search.ts`            | 修复 retrievalScope 过滤                                     | P6       |
| `src/lib/context/prompts/builder.ts`                    | 修复重复 `case 'expand'`（builder.ts:87/93 第二个不可达）    | P5       |
| `next.config.ts`                                       | 旧路由重定向                                                 | P0       |
| `prisma/schema.prisma` + 新迁移                         | 增 `ChapterScene` 表 + `NovelSettings` 嵌入字段          | P4/P6    |

### 删除文件
- `src/app/outline/page.tsx`、`src/app/write/page.tsx`、`src/app/characters/page.tsx`、`src/app/world/page.tsx`、`src/app/brainstorm/page.tsx`（扁平路由）
- `src/components/editor/novel-editor.tsx`（死代码，未被 import）

---

## 复用的现成资产（不要重写）
- **引擎类**（已实现完整逻辑，仅需注入 callAI）：`OutlineGenerator`（outline-generator.ts）、`ContentExpander`（content-expander.ts:61 已含逐场景+连续性检查）、`LanguagePolisher`（language-polisher.ts，6 轮精修 + 推荐顺序）、`MemoryManager`（memory-manager.ts）。
- **存储仓**（全套 CRUD 已写好）：`chunkRepo`、`summaryRepo`、`foreshadowRepo`、`stateRepo`。
- **工具**：`chunkText`/`estimateTokens`（chunker.ts）、`EmbeddingCache`（cache.ts，单例已存在）、`TokenBudget`（budget.ts）、`aiLogger`（ai-logger.ts）。
- **上下文组装**：`ContextPipeline`（pipeline.ts，热+温层已工作）、`WarmContextCollector` 的全量注入（warm.ts:227+）。
- **API**：novels/chapters/volumes/characters/[resource]/providers CRUD 大部分已可用。

---

## 实施依赖顺序（建议）
```
P0 路由归一  ──►  P1 创建  ──►  P2 卷纲  ──►  P3 卷细化  ──►  P4 章细纲  ──►  P5 内容生成
                                                                              │
P6 写时索引 ◄────────────────────────────────────────────────────────────────┘
   （P6 依赖 P5 产出正文；但 indexer/summarizer 可与 P5 并行开发）
P7 各项可在 P6 后独立增量（状态/伏笔/流式/记忆/润色/加密/导出 互不阻塞）
```
P0 必须最先做（否则后续页面都要二次改路由）。P6 投入产出比最高，建议紧跟 P5。

---

## ⚠️ 实施前必读（环境约束）
1. **Next.js 16 非标准约定**：`AGENTS.md` 警告本版本 API 与训练数据可能不同。写任何 route/page 前先读 `node_modules/next/dist/docs/` 对应指南。params 是 `Promise`，须 `await params`。
2. **依赖安装**：Windows 上 `npm install` 会因 `sharp`（@xenova 可选依赖）node-gyp 编译失败而整体中断。固定用 `npm install --ignore-scripts` 然后 `npm rebuild better-sqlite3`。官方 registry（npmmirror 缺这些新版本）。
3. **环境文件**：`prisma.config.ts` 依赖 `dotenv` + `.env`（`DATABASE_URL="file:dev.db"`，已补）。
4. **嵌入走云端**：不依赖本地模型，绕开 sharp/onnxruntime。

---

## 端到端验证方案
1. **构建**：`npm run build` 通过（TS strict）。每阶段完成后跑一次。
2. **冒烟（手动跑 dev）**：`npm run dev` → 配置 provider（/settings 填 DeepSeek key）。
3. **全链路**：新建小说（P1）→ 输入主题生成卷纲（P2）→ 编辑确认落库 → 细化某卷（P3）→ 某章生成场景细纲并编辑保存（P4）→ 展开为正文（P5）→ 进编辑器精修（续写/润色）。
4. **RAG 验证（P6 关键）**：写完第 1 章保存 → 查 DB：`ChapterChunk`/`chunk_vec`/`ChapterSummary` 有数据 → 写第 2 章续写时，用 `GET /api/ai/generate`（预览接口，不花 token）查 `debugInfo.coldContext` 与「前情回顾」非空。
5. **状态/伏笔（P7）**：展开含伏笔的章 → 伏笔看板出现 planted → 角色状态时间线更新。
6. **流式**：续写时观察 SSE 逐字渲染。
7. **路由（P0）**：全程 URL 带同一 novelId，无 404，侧边栏高亮跟随，跳转无整页刷新。
8. **DB 检查命令**：`npx prisma studio` 或 sqlite 查 `ChapterChunk`/`ChapterSummary`/`ChapterScene`/`CharacterStateSnapshot`/`Foreshadowing` 行数。

---

## 范围与边界
- 本次**仅交付本执行方案文档**，不写代码。
- 自动化采用**分阶段 + 人工关卡**，不实现「一键全自动生成整本」（如后续需要，在 P5 之上加一个串联 runner 即可，架构已支持）。
- 加密/鉴权标注为「网络暴露前必须」，本地单用户可延后。分析一下这个方案的完整度