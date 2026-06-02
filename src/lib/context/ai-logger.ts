/**
 * AICallLogger — AI 调用日志服务
 * 
 * 记录每次 AI 调用的完整上下文、响应和 token 使用情况。
 * 用于调试、复盘和成本追踪。
 */

import { prisma } from '@/lib/db/prisma'
import type { AICallRecord } from './types'

export class AICallLogger {
  /** 记录 AI 调用 */
  async log(record: AICallRecord) {
    return prisma.aICallLog.create({
      data: {
        novelId: record.novelId,
        chapterId: record.chapterId,
        operation: record.operation,
        modelId: record.modelId,
        modelName: record.modelName,
        contextJson: record.contextJson,
        promptText: record.promptText,
        responseText: record.responseText,
        tokenUsage: record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
        latencyMs: record.latencyMs,
      },
    })
  }

  /** 获取某小说的最近调用记录 */
  async getRecent(novelId: string, limit: number = 20) {
    return prisma.aICallLog.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        operation: true,
        modelName: true,
        tokenUsage: true,
        latencyMs: true,
        createdAt: true,
        chapterId: true,
      },
    })
  }

  /** 获取某章节的调用记录 */
  async getByChapter(chapterId: string) {
    return prisma.aICallLog.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** 获取调用统计 */
  async getStats(novelId: string) {
    const logs = await prisma.aICallLog.findMany({
      where: { novelId },
      select: {
        operation: true,
        modelName: true,
        tokenUsage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    let totalCalls = logs.length
    const byOperation: Record<string, number> = {}
    const byModel: Record<string, number> = {}

    for (const log of logs) {
      if (log.tokenUsage) {
        try {
          const usage = JSON.parse(log.tokenUsage)
          totalPromptTokens += usage.promptTokens ?? 0
          totalCompletionTokens += usage.completionTokens ?? 0
        } catch { /* ignore */ }
      }
      byOperation[log.operation] = (byOperation[log.operation] ?? 0) + 1
      byModel[log.modelName] = (byModel[log.modelName] ?? 0) + 1
    }

    return {
      totalCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      byOperation,
      byModel,
      // 粗略成本估算（按常见模型价格）
      estimatedCost: this.estimateCost(byModel, totalPromptTokens, totalCompletionTokens),
    }
  }

  /** 删除某小说的所有日志 */
  async deleteByNovel(novelId: string) {
    return prisma.aICallLog.deleteMany({ where: { novelId } })
  }

  // ─── 成本估算 ──────────────────────────────────

  private estimateCost(
    byModel: Record<string, number>,
    promptTokens: number,
    completionTokens: number,
  ): string {
    // 价格（每 1M tokens，USD）
    const prices: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o': { prompt: 2.5, completion: 10 },
      'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
      'gpt-4-turbo': { prompt: 10, completion: 30 },
      'claude-3.5-sonnet': { prompt: 3, completion: 15 },
      'claude-3-opus': { prompt: 15, completion: 75 },
      'deepseek-v3': { prompt: 0.27, completion: 1.1 },
      'deepseek-r1': { prompt: 0.55, completion: 2.19 },
    }

    let totalCost = 0

    for (const [model, count] of Object.entries(byModel)) {
      const price = prices[model]
      if (!price) continue
      const ratio = count / Object.values(byModel).reduce((a, b) => a + b, 0)
      totalCost += (promptTokens * ratio / 1_000_000) * price.prompt
      totalCost += (completionTokens * ratio / 1_000_000) * price.completion
    }

    return totalCost < 0.01
      ? '< $0.01'
      : `≈ $${totalCost.toFixed(2)}`
  }
}

export const aiLogger = new AICallLogger()
