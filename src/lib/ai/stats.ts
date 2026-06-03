/**
 * ai-stats.ts — API 调用统计追踪器
 * 
 * 内存中追踪所有 AI 调用，供前端悬浮窗实时展示：
 * - 调用次数 / 成功 / 失败
 * - Token 用量（prompt + completion）
 * - 嵌入缓存命中率
 * - 估算费用
 */

interface CallRecord {
  operation: string       // 'chat' | 'embedding' | 'summary'
  model: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  success: boolean
  cached: boolean         // embedding cache hit
  cost: number            // 估算费用 $
  timestamp: number
}

const MAX_RECORDS = 100
const records: CallRecord[] = []

// ─── 计费参考（$/1M tokens）───────────────────────

const PRICING: Record<string, { prompt: number; completion: number }> = {
  'deepseek-v4-flash': { prompt: 0.14, completion: 0.28 },
  'deepseek-v4-pro':   { prompt: 0.55, completion: 2.19 },
  'deepseek-v3':       { prompt: 0.27, completion: 1.10 },
  'gpt-4o':            { prompt: 2.50, completion: 10.00 },
  'gpt-4o-mini':       { prompt: 0.15, completion: 0.60 },
  'BAAI/bge-large-zh-v1.5': { prompt: 0.10, completion: 0 },
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model]
  if (!p) {
    // Fuzzy match
    for (const [key, price] of Object.entries(PRICING)) {
      if (model.includes(key) || key.includes(model)) {
        return (promptTokens * price.prompt + completionTokens * price.completion) / 1_000_000
      }
    }
    return (promptTokens * 0.5 + completionTokens * 1.0) / 1_000_000
  }
  return (promptTokens * p.prompt + completionTokens * p.completion) / 1_000_000
}

// ─── 记录调用 ────────────────────────────────────

export function recordAICall(opts: {
  operation: string
  model: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  success: boolean
  cached?: boolean
}) {
  const cost = estimateCost(opts.model, opts.promptTokens, opts.completionTokens)
  records.unshift({ ...opts, cached: opts.cached || false, cost, timestamp: Date.now() })
  if (records.length > MAX_RECORDS) records.pop()
}

// ─── 导出统计 ────────────────────────────────────

export interface AIStats {
  calls: {
    total: number
    success: number
    failed: number
    totalLatencyMs: number
  }
  tokens: {
    totalPrompt: number
    totalCompletion: number
    total: number
  }
  embedding: {
    hits: number
    misses: number
    hitRate: number
  }
  cost: {
    total: number
  }
  recent: Array<{
    operation: string
    model: string
    tokens: number
    latencyMs: number
    success: boolean
    cached: boolean
    cost: number
    time: number
  }>
}

export function getStats(): AIStats {
  const recent = records.slice(0, 20)
  const embeddingCalls = records.filter(r => r.operation === 'embedding')

  return {
    calls: {
      total: records.length,
      success: records.filter(r => r.success).length,
      failed: records.filter(r => !r.success).length,
      totalLatencyMs: records.reduce((s, r) => s + r.latencyMs, 0),
    },
    tokens: {
      totalPrompt: records.reduce((s, r) => s + r.promptTokens, 0),
      totalCompletion: records.reduce((s, r) => s + r.completionTokens, 0),
      total: records.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
    },
    embedding: {
      hits: embeddingCalls.filter(r => r.cached).length,
      misses: embeddingCalls.filter(r => !r.cached).length,
      hitRate: embeddingCalls.length > 0
        ? embeddingCalls.filter(r => r.cached).length / embeddingCalls.length
        : 0,
    },
    cost: {
      total: records.reduce((s, r) => s + r.cost, 0),
    },
    recent: recent.map(r => ({
      operation: r.operation,
      model: r.model,
      tokens: r.promptTokens + r.completionTokens,
      latencyMs: r.latencyMs,
      success: r.success,
      cached: r.cached,
      cost: r.cost,
      time: r.timestamp,
    })),
  }
}

/** 重置统计 */
export function resetStats() {
  records.length = 0
}
