# AI 小说工作站

AI 辅助长篇小说创作平台。从主题到完稿，全流程 AI 加持。

## 功能

### 📚 项目管理
- 创建/管理多部小说，支持封面、简介、类型标签
- 软删除回收站，30 天内可恢复

### 🗺️ 大纲生成（三步流水线）
1. **输入主题** → AI 生成卷+章大纲结构
2. **章节细纲** → AI 拆分为 3-6 个场景（地点/角色/冲突/结果/情感节拍）
3. **内容展开** → 按细纲逐场景扩写为完整章节

### ✍️ 智能写作
- **TipTap 富文本编辑器**：加粗、斜体、标题、引用、列表
- **AI 续写**：从光标处继续写作，自动注入角色+世界观上下文
- **AI 润色**：选中文字 → 浮动工具栏 → 一键优化表达
- **AI 扩写**：选中大纲点 → 展开为完整段落
- **自动保存**：停止输入 1.5 秒自动存，`Ctrl+S` 手动保存

### 👤 角色管理
- 完整角色档案：姓名、性格、背景、动机、弱点、口头禅、能力
- 角色关系图谱
- 出场章节追踪

### 🌍 世界观
- **地点/场景**：名称、类型、描述
- **势力/组织**：首领、目标、成员
- **规则/设定**：修炼体系、魔法系统、社会制度
- **时间线**：事件节点，关联章节和角色

### 🤖 AI 上下文管理
- **三层上下文架构**：热（前文+大纲）→ 温（角色+地点+摘要+伏笔）→ 冷（语义检索）
- **生成操作全量注入**：大纲生成/内容展开自动注入全部角色和世界观
- **向量检索**：纯 JS 余弦相似度，5K 切片 <20ms
- **Token 预算**：自动截断，优先级可控

### 📤 导出
- TXT / Markdown / EPUB（规划中）

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript (strict) |
| 数据库 | SQLite + Prisma 7 |
| 编辑器 | TipTap (ProseMirror) |
| AI | OpenAI 兼容 API（DeepSeek / OpenAI / 自定义） |
| 向量 | better-sqlite3 BLOB + 纯 JS 余弦相似度 |
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

1. 进入「设置」页面
2. 点击「一键配置 DeepSeek」或手动添加提供商
3. 填入 API Key（从 [platform.deepseek.com](https://platform.deepseek.com) 获取）
4. 默认模型：`deepseek-v4-flash`（快速）/ `deepseek-v4-pro`（高质量）

支持任何 OpenAI 兼容 API（Anthropic、Ollama 等）。

## 使用流程

```
1. 新建小说 → 设置 → 配置 AI Key
2. 角色管理 → 添加主角、配角
3. 世界观 → 添加地点、势力、规则
4. 大纲管理 → 输入主题 → AI 生成大纲
5. 点击章节「细纲」→ AI 生成场景级细纲
6. 点击章节「展开」→ AI 按细纲写完整内容
7. 点击「写作」→ 进入编辑器 → AI 续写/润色/扩写
8. 反复迭代，直到完稿
```

## 项目结构

```
src/
├── app/                    # Next.js 页面 & API
│   ├── page.tsx            # 首页（小说列表）
│   ├── layout.tsx          # 根布局
│   ├── novel/[id]/         # 小说仪表盘 & 写作页
│   ├── outline/            # 大纲管理
│   ├── characters/         # 角色管理
│   ├── world/              # 世界观
│   ├── brainstorm/         # 头脑风暴
│   ├── settings/           # AI 提供商配置
│   └── api/                # REST API
├── components/
│   ├── editor/             # TipTap 编辑器组件
│   ├── layout/             # 侧边栏布局
│   └── ui/                 # shadcn/ui 组件
├── lib/
│   ├── db/                 # Prisma 客户端
│   └── context/            # 核心管线
│       ├── pipeline.ts     # 上下文组装主流程
│       ├── budget.ts       # Token 预算管理
│       ├── outline-generator.ts  # 大纲生成
│       ├── content-expander.ts   # 内容扩充
│       ├── language-polisher.ts  # 语言优化
│       ├── memory-manager.ts     # 长期记忆
│       ├── embedding/      # 嵌入服务 & 分块
│       ├── storage/        # 向量存储 & CRUD
│       ├── retriever/      # 上下文采集器
│       └── prompts/        # Prompt 模板
└── prisma/
    └── schema.prisma       # 15 张表数据模型
```

## License

MIT
