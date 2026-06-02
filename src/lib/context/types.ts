// ─── 上下文请求 ──────────────────────────────────

export interface ContextRequest {
  novelId: string
  chapterId: string
  operation: 'continue' | 'polish' | 'expand' | 'brainstorm' | 'custom'
  cursorPosition?: number          // 光标在章节中的字符偏移
  selectedText?: string            // 润色/扩写的选中文本
  userInstruction?: string         // 自定义/头脑风暴的用户输入
  outlineNodeId?: string           // 当前大纲节点 ID
  options?: ContextOptions         // 用户覆盖的选项
}

export interface ContextOptions {
  hotWindowSize?: number           // 前文窗口大小（字数），默认 2000
  retrievalScope?: 'chapter' | 'volume' | 'novel' | 'smart'
  retrievalTopK?: number           // RAG 返回 top-K，默认 5
  injectCharacters?: 'auto' | 'manual' | 'off'
  injectRecentSummary?: boolean
  injectForeshadowing?: boolean
}

// ─── 上下文预算 ──────────────────────────────────

export interface ContextBudget {
  totalTokens: number              // 模型窗口总 token
  systemReserve: number            // 系统指令预留
  hotLimit: number                 // 热上下文上限
  warmLimit: number                // 温上下文上限
  coldLimit: number                // 冷上下文上限
  responseReserve: number          // 回复预留
}

export interface BudgetUsage {
  systemTokens: number
  hotTokens: number
  warmTokens: number
  coldTokens: number
  totalUsed: number
  totalBudget: number
  warnings: string[]
}

// ─── 组装后的上下文 ──────────────────────────────

export interface AssembledContext {
  systemPrompt: string             // 组装后的系统指令
  messages: ChatMessage[]          // 最终发送的消息列表
  metadata: {
    budgetUsage: BudgetUsage
    entitiesFound: EntityMatch[]
    chunksRetrieved: number
    foreshadowingsFlagged: number
    totalTokens: number
    warnings: string[]
  }
  debugInfo: {
    hotContext: string
    warmContext: string
    coldContext: string
    assemblyTimeMs: number
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ─── 实体扫描 ────────────────────────────────────

export interface EntityMatch {
  type: 'character' | 'location' | 'faction'
  id: string
  name: string
  matchedText: string
  frequency: number
}

// ─── 上下文收集器 ────────────────────────────────

export interface ContextCollector {
  // 热上下文（收集后不压缩）
  hot: {
    preContext: string              // 光标前文
    postContext: string             // 光标后文
    outlinePosition: string         // 大纲位置描述
    novelMeta: string               // 小说元信息
  }
  // 温上下文（收集后可压缩）
  warm: {
    characterCards: CharacterCard[]
    locationCards: LocationCard[]
    recentSummaries: ChapterSummaryCard[]
    foreshadowReminders: ForeshadowReminder[]
    factions: FactionCard[]
    worldRules: WorldRuleCard[]
  }
  // 冷上下文（RAG 检索结果）
  cold: {
    retrievedChunks: RetrievedChunk[]
    retrievedForeshadowings: ForeshadowReminder[]
  }
}

export interface CharacterCard {
  id: string
  name: string
  identity: string                 // 一句话身份
  traits: string[]                 // 性格标签
  currentState: string             // 当前状态
  speechStyle: string              // 说话风格/口头禅
}

export interface LocationCard {
  id: string
  name: string
  description: string              // 截断到 100 字
}

export interface ChapterSummaryCard {
  chapterId: string
  chapterTitle: string
  chapterNumber: number
  oneLineSummary: string
}

export interface ForeshadowReminder {
  id: string
  content: string
  plantChapterTitle: string
  plantChapterNumber: number
  type: string
  status: string
}

export interface FactionCard {
  id: string; name: string; type: string | null; goal: string | null; description: string | null
}

export interface WorldRuleCard {
  id: string; title: string; category: string | null; content: string
}

export interface RetrievedChunk {
  chunkId: string
  chapterId: string
  chapterTitle: string
  chapterNumber: number
  content: string                  // 切片文本（可能已截断）
  score: number                    // 相似度分数
  source: 'vector' | 'keyword'
}

// ─── Prompt 模板 ─────────────────────────────────

export interface PromptTemplate {
  id: string
  name: string
  type: 'system' | 'user'
  operation: string
  template: string
  variables: string[]
  isBuiltin: boolean
  isDefault: boolean
}

// ─── AI 调用日志 ─────────────────────────────────

export interface AICallRecord {
  novelId: string
  chapterId?: string
  operation: string
  modelId: string
  modelName: string
  contextJson: string
  promptText: string
  responseText?: string
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs?: number
}

// ─── 嵌入 & 向量 ─────────────────────────────────

export interface EmbeddingConfig {
  provider: 'local' | 'openai'
  model: string                    // 本地: 'bge-small-zh-v1.5', OpenAI: 'text-embedding-3-small'
  dimensions: number
  apiKey?: string
}

export interface VectorSearchResult {
  id: string
  distance: number
  metadata?: Record<string, unknown>
}

// ─── 记忆系统 ────────────────────────────────────

export type MemoryType = 'semantic' | 'episodic' | 'procedural'
export type MemorySubType = 'character' | 'location' | 'rule' | 'event' | 'plot_thread' | 'style_pattern'

export interface MemoryItem {
  id: string
  novelId: string
  type: MemoryType
  subType?: MemorySubType
  title: string
  content: string
  importance: number               // 0-1
  accessCount: number
  lastAccess?: Date
  sourceChapterId?: string
  relatedEntityIds?: string[]
  embedding?: number[]
}

// ─── 大纲生成 ────────────────────────────────────

export interface OutlineGenRequest {
  theme: string                    // 用户输入的主题
  genre?: string
  targetLength?: number            // 目标总字数
  style?: string
  extraInstructions?: string
}

export interface OutlineNode {
  id: string
  title: string
  summary: string
  type: 'volume' | 'chapter' | 'section'
  children: OutlineNode[]
  status: 'pending' | 'generating' | 'done'
  targetWords?: number
  keyEvents?: string[]
  characters?: string[]
}

// ─── 内容扩充 ────────────────────────────────────

export interface ExpansionRequest {
  novelId: string
  chapterId: string
  outlineNodeId: string
  targetWords?: number
  perspective?: string
  includeDialogue?: boolean
}

// ─── 语言优化 ────────────────────────────────────

export type PolishPass = 'grammar' | 'style' | 'show_dont_tell' | 'dialogue' | 'pacing' | 'sensory'

export interface PolishRequest {
  novelId: string
  chapterId: string
  content: string
  passes: PolishPass[]
  options?: {
    styleTarget?: string           // "更生动"/"更简洁"/...
    characterId?: string           // 对话润色时指定角色
  }
}
