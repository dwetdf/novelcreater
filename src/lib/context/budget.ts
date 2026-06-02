/**
 * TokenBudget — Token 预算计算 & 上下文截断
 * 
 * 根据模型窗口大小分配各层上下文的 token 上限。
 * 当上下文超过预算时，按优先级逐层截断。
 */

import type { ContextBudget, BudgetUsage, ContextCollector } from './types'
import { estimateTokens } from './embedding/chunker'

export interface BudgetConfig {
  /** 模型总窗口（tokens） */
  totalWindow: number
  /** 回复预留 tokens */
  responseReserve: number
  /** 系统指令预留 tokens */
  systemReserve: number
  /** 各层占比 */
  ratios: {
    hot: number    // 热上下文占比（不可截）
    warm: number   // 温上下文占比
    cold: number   // 冷上下文占比
  }
}

const DEFAULT_CONFIG: BudgetConfig = {
  totalWindow: 128000,
  responseReserve: 6000,
  systemReserve: 500,
  ratios: {
    hot: 0.25,
    warm: 0.35,
    cold: 0.40,
  },
}

/** 模型窗口大小映射（tokens） */
export const MODEL_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'claude-3.5-sonnet': 200000,
  'claude-3-opus': 200000,
  'deepseek-v3': 128000,
  'deepseek-r1': 128000,
  'qwen-max': 32000,
  'default': 128000,
}

export class TokenBudget {
  private config: BudgetConfig

  constructor(modelName?: string) {
    this.config = { ...DEFAULT_CONFIG }
    if (modelName) {
      this.config.totalWindow = this.getWindowSize(modelName)
      this.recalculate()
    }
  }

  /** 根据模型名获取窗口大小 */
  getWindowSize(modelName: string): number {
    // 精确匹配
    if (MODEL_WINDOWS[modelName]) return MODEL_WINDOWS[modelName]
    // 模糊匹配
    for (const [key, size] of Object.entries(MODEL_WINDOWS)) {
      if (modelName.toLowerCase().includes(key)) return size
    }
    return MODEL_WINDOWS['default']
  }

  /** 计算各层 token 上限 */
  private recalculate(): void {
    const available = this.config.totalWindow - this.config.responseReserve - this.config.systemReserve
    this.config = {
      ...this.config,
      responseReserve: Math.min(this.config.responseReserve, this.config.totalWindow * 0.1),
      systemReserve: Math.min(this.config.systemReserve, this.config.totalWindow * 0.02),
    }
  }

  /** 获取当前预算分配 */
  getBudget(): ContextBudget {
    const available = this.config.totalWindow - this.config.responseReserve - this.config.systemReserve
    return {
      totalTokens: this.config.totalWindow,
      systemReserve: this.config.systemReserve,
      hotLimit: Math.floor(available * this.config.ratios.hot),
      warmLimit: Math.floor(available * this.config.ratios.warm),
      coldLimit: Math.floor(available * this.config.ratios.cold),
      responseReserve: this.config.responseReserve,
    }
  }

  /**
   * 对超出预算的上下文执行截断
   * 优先级：热 > 角色 > 近章摘要 > 冷检索 > 伏笔
   */
  truncate(
    collector: ContextCollector,
    budget: ContextBudget,
  ): { collector: ContextCollector; warnings: string[] } {
    const warnings: string[] = []
    const result = structuredClone(collector)

    // 热上下文不可截断，仅警告
    const hotTokens = this.estimateHotTokens(result.hot)
    if (hotTokens > budget.hotLimit) {
      warnings.push(`热上下文超出预算 (${hotTokens}/${budget.hotLimit})，前文可能被截断`)
      result.hot.preContext = this.truncateText(result.hot.preContext, budget.hotLimit)
    }

    // 温上下文按优先级截断
    this.truncateWarm(result, budget, warnings)

    // 冷上下文截断
    this.truncateCold(result, budget, warnings)

    return { collector: result, warnings }
  }

  /** 温上下文截断：角色 > 摘要 > 伏笔 */
  private truncateWarm(
    collector: ContextCollector,
    budget: ContextBudget,
    warnings: string[],
  ): void {
    let warmTokens = this.estimateWarmTokens(collector.warm)

    if (warmTokens <= budget.warmLimit) return

    // 1. 减少伏笔提醒
    let removed = false
    while (
      collector.warm.foreshadowReminders.length > 0 &&
      warmTokens > budget.warmLimit
    ) {
      collector.warm.foreshadowReminders.pop()
      warmTokens = this.estimateWarmTokens(collector.warm)
      removed = true
    }
    if (removed) warnings.push('已减少伏笔提醒以控制 token')

    // 2. 减少近章摘要
    removed = false
    while (
      collector.warm.recentSummaries.length > 1 &&
      warmTokens > budget.warmLimit
    ) {
      collector.warm.recentSummaries.pop()
      warmTokens = this.estimateWarmTokens(collector.warm)
      removed = true
    }
    if (removed) warnings.push('已减少近章摘要以控制 token')

    // 3. 减少角色注入
    removed = false
    while (
      collector.warm.characterCards.length > 1 &&
      warmTokens > budget.warmLimit
    ) {
      collector.warm.characterCards.pop()
      warmTokens = this.estimateWarmTokens(collector.warm)
      removed = true
    }
    if (removed) warnings.push('已减少角色注入以控制 token')

    // 4. 最后手段：截断各卡片内容
    if (warmTokens > budget.warmLimit) {
      for (const card of collector.warm.characterCards) {
        card.currentState = this.truncateText(card.currentState, 30)
      }
      for (const loc of collector.warm.locationCards) {
        loc.description = this.truncateText(loc.description, 50)
      }
      warnings.push('已压缩温上下文内容以控制 token')
    }
  }

  /** 冷上下文截断：减少检索结果数量 */
  private truncateCold(
    collector: ContextCollector,
    budget: ContextBudget,
    warnings: string[],
  ): void {
    let coldTokens = this.estimateColdTokens(collector.cold)

    if (coldTokens <= budget.coldLimit) return

    // 减少检索切片
    let removed = false
    while (
      collector.cold.retrievedChunks.length > 1 &&
      coldTokens > budget.coldLimit
    ) {
      collector.cold.retrievedChunks.pop()
      coldTokens = this.estimateColdTokens(collector.cold)
      removed = true
    }
    if (removed) warnings.push('已减少检索结果以控制 token')

    // 截断每个切片的内容
    if (coldTokens > budget.coldLimit) {
      for (const chunk of collector.cold.retrievedChunks) {
        chunk.content = this.truncateText(chunk.content, 200)
      }
      warnings.push('已压缩检索结果内容以控制 token')
    }
  }

  // ─── Token 估算 ───────────────────────────────

  private estimateHotTokens(hot: ContextCollector['hot']): number {
    return (
      estimateTokens(hot.preContext) +
      estimateTokens(hot.postContext) +
      estimateTokens(hot.outlinePosition) +
      estimateTokens(hot.novelMeta)
    )
  }

  private estimateWarmTokens(warm: ContextCollector['warm']): number {
    let t = 0
    for (const c of warm.characterCards) {
      t += estimateTokens(c.identity + c.traits.join('') + c.currentState + c.speechStyle)
    }
    for (const l of warm.locationCards) {
      t += estimateTokens(l.description)
    }
    for (const s of warm.recentSummaries) {
      t += estimateTokens(s.oneLineSummary + s.chapterTitle)
    }
    for (const f of warm.foreshadowReminders) {
      t += estimateTokens(f.content)
    }
    return t
  }

  private estimateColdTokens(cold: ContextCollector['cold']): number {
    let t = 0
    for (const c of cold.retrievedChunks) {
      t += estimateTokens(c.content)
    }
    for (const f of cold.retrievedForeshadowings) {
      t += estimateTokens(f.content)
    }
    return t
  }

  // ─── 工具 ──────────────────────────────────────

  private truncateText(text: string, maxTokens: number): string {
    if (!text) return ''
    const estimated = estimateTokens(text)
    if (estimated <= maxTokens) return text

    // 粗略：1 token ≈ 0.7 中文字符
    const maxChars = Math.floor(maxTokens * 0.7)
    const truncated = text.slice(0, maxChars)

    // 在句子边界切断
    const lastPeriod = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('\n'),
    )
    if (lastPeriod > maxChars * 0.5) {
      return truncated.slice(0, lastPeriod + 1)
    }
    return truncated + '...'
  }

  /** 更新配置 */
  updateConfig(partial: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...partial }
    this.recalculate()
  }

  /** 根据模型更新窗口 */
  setModel(modelName: string): void {
    this.config.totalWindow = this.getWindowSize(modelName)
    this.recalculate()
  }
}
