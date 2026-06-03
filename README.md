# AI 小说工作站

AI 辅助长篇小说创作平台。从主题到完稿，全流程 AI 加持——大纲生成、场景细纲拆解、逐场景内容展开、智能续写润色、伏笔追踪、语义检索 RAG，形成完整创作闭环。

## ✅ 已实现功能

### 📚 项目管理
- 首页小说列表：快速查看所有小说，显示章节数、类型标签、更新时间
- 分步创建向导（`/novel/new`）：标题、简介、类型标签、叙事视角、时态、目标字数、风格画像
- 首页快速创建弹窗（简化版）
- 小说仪表盘：总字数、章数、角色数统计，快捷入口
- 小说级设置页：上下文窗口、检索范围、注入策略、自动保存间隔

### 🗺️ 大纲生成（三步关卡流水线）
1. **主题 → 卷章结构**：AI 根据主题 + 已有角色/势力/世界观生成 3-5 卷大纲，Markdown 预览 → 关卡确认后事务批量落库（卷序 × 章序显式赋值）
2. **章节细纲**：选中章节 → AI 拆分为 3-6 个结构化场景卡片（地点 / 角色 / 冲突 / 结果 / 情感节拍），持久化到 `ChapterScene` 表，刷新不丢失；支持手动增删改排序
3. **内容展开**：`ContentExpander` 引擎逐场景生成正文 → 连续性检查（时间线 / 状态 / 过渡矛盾）→ 合并写入章节，无场景时降级为摘要直达展开
4. **单卷细化**：选中某卷 → AI 基于前后卷上下文 + 角色/世界观重新生成/补全章列表

### ✍️ 智能写作（`/novel/[id]/write`）
- **TipTap 富文本编辑器**：加粗、斜体、下划线、标题、引用、有序/无序列表，快捷键工具栏
- **AI 续写**：光标处继续写作，三层上下文自动注入（前文 + 角色卡 + 世界观 + RAG 检索）
- **AI 润色**：选中文字 → 浮动工具栏 → 一键优化；后端 `LanguagePolisher` 支持 6 轮独立精修（语法修正 / 风格增强 / 对话打磨 / 节奏控制 / 感官描写 / Show-don't-tell）
- **AI 扩写**：选中大纲点 → 展开为完整段落
- **自动保存**：停止输入 1.5 秒自动存，`Ctrl+S` 手动保存，保存去重（hash 未变不写库）
- **流式输出（SSE）**：续写/润色/扩写逐字实时渲染，不再整段等待
- **场景细纲浮窗**：侧面板展示/编辑当前章节的场景卡片

### 👤 角色管理（`/novel/[id]/characters`）
- 完整角色档案：姓名、性别、年龄、外貌、性格、背景、动机、弱点、口头禅、能力、角色定位
- **AI 自动生成角色集**：基于小说主题和类型，AI 批量生成主角/反派/配角/NPC（`/api/novels/[id]/generate-worldbuilding`）
- **角色状态时间线**：展开章节后 AI 自动抽取每个出场角色的状态变化（位置/伤情/情绪/生死），角色页可按角色查看历史
- 角色关系数据模型已就绪（`CharacterRelation` 表），API 待接线

### 🌍 世界观（`/novel/[id]/world`）
- **地点/场景**：名称、类型（城市/建筑/自然/秘境）、描述，支持树形嵌套
- **势力/组织**：名称、类型（宗门/国家/商会/家族）、首领、目标、描述
- **规则/设定**：分类（修炼体系/魔法系统/科技水平/社会制度）、内容
- **时间线**：事件节点 + 故事内时间，关联章节和角色
- **AI 一键生成世界**：输入主题 → AI 同时生成角色 + 势力 + 世界观规则
- 所有子资源完整 CRUD（`locations` / `factions` / `world-rules` / `timeline`）

### 🧠 头脑风暴（`/novel/[id]/brainstorm`）
- 自由提问 → AI 基于小说上下文给出创意建议
- 内置 6 个快速提问模板（脱困方案 / 剧情反转 / 反派背景 / 冲突点子 / 关系转变 / 修炼体系）

### 🔍 伏笔管理（`/novel/[id]/foreshadowings`）
- 看板视图：已埋设 / 计划回收 / 已回收 / 已废弃 四状态
- 展开章节后 AI 自动检测新埋伏笔（物品 / 身份 / 对话 / 事件 / 其他）
- 手动标记已回收或废弃
- 埋设章节 & 计划回收章节关联

### 🔬 内容一致性校验
- 检查最近 5 章的角色状态矛盾、伏笔超期、视角漂移、时间线矛盾
- AI 编辑视角输出问题列表（error / warning 分级）

### 🤖 AI 上下文管理（三层架构）
```
热层（Hot）    → 前文 N 字 + 后文 + 大纲位置 + 小说元信息
温层（Warm）   → 角色压缩卡 + 地点卡片 + 近章摘要链 + 势力/世界观 + 伏笔提醒
冷层（Cold）   → 语义向量检索（ChapterChunk）+ 伏笔语义检索
```
- **实体扫描**：Trie 树匹配前文中的角色/地点名 → 精准注入相关设定
- **Token 预算**：按模型窗口自动截断，优先级：热 > 温 > 冷，超限告警
- **Prompt 构建器**：根据操作类型（续写/润色/扩写/头脑风暴）选择不同系统指令模板
- **AI 调用日志**：每次调用记录完整上下文 + 响应 + Token 用量，支持回溯调试

### 📊 写时索引层（盘活 RAG 冷层）
- **分块**：章节保存后 HTML→纯文本→800 字滑动窗口分块（100 字重叠），长块自动子拆分
- **嵌入**：云端 Embeddings API（复用 AI Provider 配置或独立配置），支持 OpenAI 兼容 `/embeddings` 端点
- **去重**：SHA-256 内容哈希比对，未变跳过索引
- **摘要**：AI 生成三级摘要（~30字 / ~150字 / ~500字）→ `ChapterSummary` 表，盘活「前情回顾」
- **状态快照**：AI 抽取角色状态变化 → `CharacterStateSnapshot` 表
- **伏笔检测**：AI 识别新埋伏笔 → `Foreshadowing` 表
- **触发方式**：前端保存成功后显式调用索引 API，或后端 `POST /api/novels/[id]/reindex` 全书重建
- **嵌入缓存**：`EmbeddingCache` 单例去重，相同文本不重复调 API

### 📤 导出
- **TXT**：纯文本，按卷→章拼接，仪表盘「导出 TXT」按钮点击即下载
- **Markdown**：带标题层级 + 卷章结构的 `.md` 文件，仪表盘「导出 Markdown」按钮点击即下载
- **API**：`GET /api/novels/[id]/export?format=txt|md`，`Content-Disposition: attachment` 触发浏览器下载
- EPUB：规划中

### ⚙️ 系统配置
- **AI 提供商管理**（`/settings`）：添加/编辑/删除多个 Provider，API Key AES-256-GCM 加密存储
- 一键配置 DeepSeek、硅基流动（含嵌入模型自动配置）
- **嵌入提供商独立配置**：聊天和 Embeddings 可使用不同 Provider / Model
- **AI 调用统计**（`/api/stats`）：总调用次数 / Token 用量 / 成功率实时监控

## ⚠️ 已实现但待完善

| 功能 | 当前状态 | 待补 |
|------|---------|------|
| 长期记忆 `MemoryManager` | 类完整实现，`memory-singleton.ts` 已接线 | **从未被调用**，无 API 入口，无 UI |
| 角色关系图谱 | `CharacterRelation` 表 + CRUD 就绪 | **无前端 UI** 展示关系图 |
| 角色关系可视化 | 关系数据可读写 | 无关系图谱/力导向图渲染 |
| EPUB 导出 | TXT / MD 已实现 + 仪表盘按钮已接线 | EPUB 生成器未开发 |
| 章节版本历史 | — | 无历史快照 / 回退机制 |
| 自动状态快照调度 | `autoSnapshotInterval` 设置项存在 | 无定时器/调度器消费 |
| 风格画像自动学习 | 字段 `styleProfile` 存在 | 无「粘贴范文→AI提炼风格」功能 |
| 拖拽排序 | 章节/场景 `sortOrder` 可 PATCH | 无拖拽 UI（仅按钮上移/下移） |
| 用户认证 | — | 本地单用户可用，网络部署需鉴权 |

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript (strict) |
| 数据库 | SQLite + Prisma 7 |
| 编辑器 | TipTap (ProseMirror) |
| AI | OpenAI 兼容 API（DeepSeek / OpenAI / 硅基流动 / 自定义） |
| 向量 | better-sqlite3 BLOB + 云端 Embeddings API（带本地 Xenova 回退） |
| 加密 | AES-256-GCM（API Key 存储） |
| UI | Tailwind CSS + shadcn/ui |

## 快速开始

```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma migrate dev

# 启动开发服务器
npm run dev
```

打开 `http://localhost:3000`

## 配置 AI

1. 进入「设置」页面（`/settings`）
2. 点击「一键配置 DeepSeek」或「一键配置硅基流动」自动填充
3. 或手动添加任意 OpenAI 兼容提供商（Anthropic、Ollama 等）
4. 嵌入模型可独立配置（`NovelSettings.embeddingProviderId`），未配则回退到聊天 Provider

## 使用流程

```
1. 新建小说（向导或首页快速创建）→ 自动创建 NovelSettings
2. AI 一键生成角色 + 势力 + 世界观 → 或手动逐个添加
3. 大纲页（/novel/[id]/outline）→ 输入主题 → AI 生成卷章结构
4. 预览编辑 → 确认 → 事务落库
5. 对每章：点「细纲」→ AI 生成场景卡片 → 编辑确认
6. 点「展开」→ AI 逐场景写正文 → 自动建索引
7. 写作页（/novel/[id]/write）→ 编辑器精修 → AI 续写/润色
8. 章节保存后自动触发索引（分块+嵌入+摘要+状态快照+伏笔检测）
9. 伏笔看板追踪埋设/回收状态
10. 导出 TXT / MD
```

## 项目结构

```
src/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # 首页（小说列表 + 快速创建）
│   ├── layout.tsx                    # 根布局
│   ├── settings/page.tsx             # AI 提供商管理（全局）
│   ├── novel/
│   │   ├── new/page.tsx              # 新建小说分步向导
│   │   └── [id]/
│   │       ├── layout.tsx            # 小说作用域布局（校验 + Context）
│   │       ├── breadcrumb.tsx        # 面包屑导航
│   │       ├── page.tsx              # 小说仪表盘
│   │       ├── outline/page.tsx      # 大纲管理（卷章树 + AI 生成关卡）
│   │       ├── write/page.tsx        # TipTap 写作编辑器
│   │       ├── characters/page.tsx   # 角色管理 + 状态时间线
│   │       ├── world/page.tsx        # 世界观（地点/势力/规则/时间线）
│   │       ├── brainstorm/page.tsx   # AI 头脑风暴
│   │       ├── foreshadowings/page.tsx  # 伏笔管理看板
│   │       └── settings/page.tsx     # 小说级上下文设置
│   └── api/
│       ├── ai/generate/route.ts      # 统一 AI 调用入口（流式 + 非流式）
│       ├── novels/route.ts           # 小说 CRUD
│       ├── novels/[id]/route.ts      # 小说详情 + PATCH + DELETE
│       ├── novels/[id]/volumes/      # 卷 CRUD
│       ├── novels/[id]/chapters/     # 章节列表 + 创建
│       ├── novels/[id]/chapters/[chapterId]/  # 章节 CRUD + move
│       │   ├── scenes/               # 场景细纲 CRUD
│       │   ├── expand/               # ContentExpander 内容展开
│       │   ├── polish/               # LanguagePolisher 多轮精修
│       │   └── index/                # 写时索引（分块+嵌入+摘要+抽取）
│       ├── novels/[id]/outline/generate/     # 大纲生成
│       ├── novels/[id]/outline/commit/       # 大纲事务落库
│       ├── novels/[id]/outline/refine-volume/ # 单卷 AI 细化
│       ├── novels/[id]/characters/   # 角色 CRUD + 状态历史
│       ├── novels/[id]/[resource]/   # 通用子资源（location/faction/world-rule/timeline）
│       ├── novels/[id]/foreshadowings/ # 伏笔 CRUD
│       ├── novels/[id]/generate-worldbuilding/ # AI 批量生成角色+势力+规则
│       ├── novels/[id]/check/        # 一致性校验
│       ├── novels/[id]/export/       # TXT / MD 导出
│       ├── novels/[id]/reindex/      # 全书重建索引
│       ├── settings/providers/route.ts  # AI Provider 管理（加密存储）
│       └── stats/route.ts            # AI 调用统计
├── components/
│   ├── layout/app-sidebar.tsx        # 侧边栏（小说作用域导航）
│   └── ui/                           # shadcn/ui 基础组件
├── lib/
│   ├── ai/
│   │   ├── call.ts                   # 共享 AI 调用器（callAIChat/Single/Split + 流式）
│   │   └── stats.ts                  # 内存统计
│   ├── context/                      # 核心上下文管线
│   │   ├── pipeline.ts               # 五阶段上下文组装（Hot→Warm→Cold→Budget→Prompt）
│   │   ├── budget.ts                 # Token 预算 + 截断策略
│   │   ├── types.ts                  # 全类型定义
│   │   ├── outline-generator.ts      # 大纲生成引擎（卷结构 + 场景细纲）
│   │   ├── content-expander.ts       # 场景→正文扩展引擎（连续性检查）
│   │   ├── language-polisher.ts      # 6 轮多 pass 语言精修
│   │   ├── build-expansion-context.ts # 展开上下文字符串桥接
│   │   ├── indexer.ts                # 写时索引（分块+嵌入+向量写入+去重）
│   │   ├── summarizer.ts             # AI 三级摘要生成
│   │   ├── extractor.ts              # 状态快照 + 伏笔抽取
│   │   ├── memory-manager.ts         # 长期记忆（三种类型 + 衰减）
│   │   ├── memory-singleton.ts       # MemoryManager 单例接线
│   │   ├── ai-logger.ts              # AI 调用日志（DB 持久化）
│   │   ├── embedding/
│   │   │   ├── service.ts            # 嵌入服务（云端 OpenAI + 本地 Xenova 回退）
│   │   │   ├── chunker.ts            # 文本分块（800 字滑动窗口）
│   │   │   └── cache.ts              # 嵌入缓存去重
│   │   ├── storage/
│   │   │   ├── chunk-repo.ts         # ChapterChunk CRUD
│   │   │   ├── summary-repo.ts       # ChapterSummary upsert
│   │   │   ├── state-repo.ts         # CharacterStateSnapshot CRUD
│   │   │   ├── foreshadow-repo.ts    # Foreshadowing CRUD
│   │   │   └── vector.ts             # 向量存储（better-sqlite3 BLOB）
│   │   ├── retriever/
│   │   │   ├── hot.ts                # 热层采集（前文+大纲位置）
│   │   │   ├── warm.ts               # 温层采集（角色卡+摘要链+伏笔提醒）
│   │   │   ├── cold.ts               # 冷层采集（语义检索+伏笔检索）
│   │   │   ├── hybrid-search.ts      # 混合搜索（语义+关键词）
│   │   │   └── entity-scan.ts        # Trie 实体扫描
│   │   └── prompts/builder.ts        # Prompt 模板构建器
│   ├── context-react/novel-context.tsx # 小说作用域 React Context
│   └── db/prisma.ts                   # Prisma 客户端单例
└── prisma/
    └── schema.prisma                  # 19 张表数据模型
```

## License

MIT
