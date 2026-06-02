/**
 * ContextPipeline — 上下文组装流水线
 * 
 * 分五阶段组装 AI 调用所需的完整上下文：
 * Phase 1: 请求验证 & 参数补全
 * Phase 2: 热上下文采集（同步 DB + 文本处理）
 * Phase 3: 实体扫描（Trie 匹配）
 * Phase 4: 温上下文采集（DB 查询）
 * Phase 5: 冷上下文采集（语义检索）
 * 
 * 最终输出 AssembledContext，包含 systemPrompt + messages + 元数据
 */

import type {
  ContextRequest,
  ContextOptions,
  AssembledContext,
  BudgetUsage,
  ContextCollector,
  ChatMessage,
  RetrievedChunk,
  ForeshadowReminder,
} from './types'

import { prisma } from '@/lib/db/prisma'
import { hotCollector } from './retriever/hot'
import { getEntityScanner } from './retriever/entity-scan'
import { warmCollector } from './retriever/warm'
import { ColdContextCollector } from './retriever/cold'
import { getEmbeddingService } from './embedding/service'
import { getVectorStore } from './storage/vector'
import { getPromptBuilder } from './prompts/builder'
import { TokenBudget } from './budget'
import { estimateTokens } from './embedding/chunker'
import { aiLogger } from './ai-logger'
import path from 'path'

export class ContextPipeline {
  private coldCollector: ColdContextCollector | null = null

  /**
   * 主入口：组装完整上下文
   */
  async assemble(req: ContextRequest): Promise<AssembledContext> {
    const startTime = Date.now()
    const warnings: string[] = []

    // ─── Phase 1: 参数补全 ──────────────────────

    const settings = await prisma.novelSettings.findUnique({
      where: { novelId: req.novelId },
    })

    const options: Required<ContextOptions> = {
      hotWindowSize: req.options?.hotWindowSize ?? settings?.contextWindowSize ?? 2000,
      retrievalScope: req.options?.retrievalScope ?? (settings?.contextRetrievalScope as ContextOptions['retrievalScope']) ?? 'volume',
      retrievalTopK: req.options?.retrievalTopK ?? settings?.contextTopK ?? 5,
      injectCharacters: req.options?.injectCharacters ?? (settings?.injectCharacters as ContextOptions['injectCharacters']) ?? 'auto',
      injectRecentSummary: req.options?.injectRecentSummary ?? settings?.injectRecentSummary ?? true,
      injectForeshadowing: req.options?.injectForeshadowing ?? settings?.injectForeshadowing ?? true,
    }

    req.options = options

    // ─── Phase 2: 热上下文 ──────────────────────

    const hotContext = await hotCollector.collect(req)

    // ─── Phase 3: 实体扫描 ──────────────────────

    const scanner = getEntityScanner()
    await scanner.buildTrie(req.novelId)

    const scanText = [
      hotContext.preContext,
      req.selectedText ?? '',
    ].join(' ')

    const entities = scanner.scan(scanText)

    // ─── Phase 4: 温上下文 ──────────────────────

    const warmContext = await warmCollector.collect(req, entities)

    // ─── Phase 5: 冷上下文（语义检索，可降级）───

    let coldContext = { retrievedChunks: [] as RetrievedChunk[], retrievedForeshadowings: [] as ForeshadowReminder[] }

    try {
      const dbPath = path.join(process.cwd(), 'dev.db')
      const vectorStore = getVectorStore(dbPath)
      
      const embeddingService = getEmbeddingService()
      vectorStore.ensureTable('chunk_vec', embeddingService.getDimensions())

      if (!this.coldCollector) {
        this.coldCollector = new ColdContextCollector(vectorStore)
      }

      coldContext = await this.coldCollector.collect(
        req,
        embeddingService,
        vectorStore,
        hotContext.preContext,
      )
    } catch (err) {
      // 向量检索不可用时降级（sqlite-vec 在 dev 模式下可能不可用）
      console.warn('[ContextPipeline] Cold context unavailable, using hot+warm only:', (err as Error).message)
    }

    // ─── 组装 & Token 预算 ──────────────────────

    const collector: ContextCollector = {
      hot: hotContext,
      warm: warmContext,
      cold: coldContext,
    }

    // Token 预算 & 截断
    const budget = new TokenBudget()
    const { collector: truncated, warnings: budgetWarnings } = budget.truncate(collector, budget.getBudget())
    warnings.push(...budgetWarnings)

    // Prompt 组装
    const promptBuilder = getPromptBuilder()
    const systemPrompt = promptBuilder.buildSystemPrompt(req, truncated)
    const userMessage = promptBuilder.buildUserMessage(req, truncated)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]
    if (userMessage) {
      messages.push({ role: 'user', content: userMessage })
    }

    // Token 统计
    const systemTokens = estimateTokens(systemPrompt)
    const hotTokens = estimateTokens(
      hotContext.preContext + hotContext.postContext + hotContext.outlinePosition + hotContext.novelMeta
    )
    const warmTokens = this.estimateWarmTokens(warmContext)
    const coldTokens = coldContext.retrievedChunks.reduce(
      (sum, c) => sum + estimateTokens(c.content),
      0,
    )
    const totalUsed = systemTokens + hotTokens + warmTokens + coldTokens

    const budgetUsage: BudgetUsage = {
      systemTokens,
      hotTokens,
      warmTokens,
      coldTokens,
      totalUsed,
      totalBudget: budget.getBudget().totalTokens,
      warnings,
    }

    return {
      systemPrompt,
      messages,
      metadata: {
        budgetUsage,
        entitiesFound: entities.slice(0, 10),
        chunksRetrieved: coldContext.retrievedChunks.length,
        foreshadowingsFlagged: coldContext.retrievedForeshadowings.length + warmContext.foreshadowReminders.length,
        totalTokens: totalUsed,
        warnings,
      },
      debugInfo: {
        hotContext: this.formatHotDebug(hotContext),
        warmContext: this.formatWarmDebug(warmContext),
        coldContext: this.formatColdDebug(coldContext),
        assemblyTimeMs: Date.now() - startTime,
      },
    }
  }

  // ─── Token 估算辅助 ───────────────────────────

  private estimateWarmTokens(warm: ContextCollector['warm']): number {
    let tokens = 0
    for (const c of warm.characterCards) {
      tokens += estimateTokens(c.identity + c.traits.join('') + c.currentState + c.speechStyle)
    }
    for (const l of warm.locationCards) {
      tokens += estimateTokens(l.description)
    }
    for (const s of warm.recentSummaries) {
      tokens += estimateTokens(s.oneLineSummary)
    }
    for (const f of warm.foreshadowReminders) {
      tokens += estimateTokens(f.content)
    }
    for (const f of (warm.factions ?? [])) {
      tokens += estimateTokens((f.name ?? '') + (f.goal ?? '') + (f.description ?? ''))
    }
    for (const r of (warm.worldRules ?? [])) {
      tokens += estimateTokens((r.title ?? '') + (r.content ?? ''))
    }
    return tokens
  }

  // ─── 调试信息 ─────────────────────────────────

  private formatHotDebug(hot: ContextCollector['hot']): string {
    return [
      hot.novelMeta,
      hot.outlinePosition,
      `[前文 ${hot.preContext.length} 字符]`,
      hot.postContext ? `[后文 ${hot.postContext.length} 字符]` : '',
    ].filter(Boolean).join('\n')
  }

  private formatWarmDebug(warm: ContextCollector['warm']): string {
    return [
      `角色卡片: ${warm.characterCards.length}`,
      `地点卡片: ${warm.locationCards.length}`,
      `近章摘要: ${warm.recentSummaries.length}`,
      `伏笔提醒: ${warm.foreshadowReminders.length}`,
      `势力: ${(warm.factions ?? []).length}`,
      `世界观: ${(warm.worldRules ?? []).length}`,
    ].join('\n')
  }

  private formatColdDebug(cold: ContextCollector['cold']): string {
    return [
      `检索切片: ${cold.retrievedChunks.length}`,
      `检索伏笔: ${cold.retrievedForeshadowings.length}`,
    ].join('\n')
  }
}

// ─── 单例 ────────────────────────────────────────

let pipelineInstance: ContextPipeline | null = null

export function getContextPipeline(): ContextPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new ContextPipeline()
  }
  return pipelineInstance
}
