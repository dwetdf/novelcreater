'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, Zap, Coins, X, ChevronDown, ChevronUp } from 'lucide-react'

interface AIStats {
  calls: { total: number; success: number; failed: number; totalLatencyMs: number }
  tokens: { totalPrompt: number; totalCompletion: number; total: number }
  embedding: { hits: number; misses: number; hitRate: number }
  cost: { total: number }
  recent: Array<{
    operation: string; model: string; tokens: number
    latencyMs: number; success: boolean; cached: boolean; cost: number; time: number
  }>
}

export function GlobalStats() {
  const [stats, setStats] = useState<AIStats | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchStats()
    const t = setInterval(fetchStats, 3000)
    return () => clearInterval(t)
  }, [fetchStats])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-primary text-primary-foreground shadow-lg p-3 hover:opacity-90 transition-opacity"
        title="AI 调用统计"
      >
        <Activity className="size-5" />
        {stats && <span className="absolute -top-1 -right-1 size-4 rounded-full bg-green-500 text-[10px] flex items-center justify-center">{stats.calls.total}</span>}
      </button>
    )
  }

  const avgLatency = stats ? (stats.calls.total > 0 ? Math.round(stats.calls.totalLatencyMs / stats.calls.total) : 0) : 0
  const embedRate = stats ? Math.round(stats.embedding.hitRate * 100) : 0

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 rounded-t-xl">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Activity className="size-4 text-primary" /> AI 调用统计
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-accent rounded">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-accent rounded">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {stats ? (
        <div className="px-4 py-3 space-y-3 text-sm">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="text-lg font-bold text-primary">{stats.calls.total}</div>
              <div className="text-[10px] text-muted-foreground">调用次数</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="text-lg font-bold text-amber-500">{(stats.tokens.total / 1000).toFixed(1)}k</div>
              <div className="text-[10px] text-muted-foreground">Token</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="text-lg font-bold text-green-600">${stats.cost.total.toFixed(4)}</div>
              <div className="text-[10px] text-muted-foreground">费用</div>
            </div>
          </div>

          {/* Detail lines */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>成功 / 失败</span>
              <span>{stats.calls.success} / {stats.calls.failed}</span>
            </div>
            <div className="flex justify-between">
              <span>平均延迟</span>
              <span>{avgLatency}ms</span>
            </div>
            <div className="flex justify-between">
              <span>嵌入缓存命中</span>
              <span className={embedRate > 0 ? 'text-green-500' : ''}>{embedRate}%</span>
            </div>
            <div className="flex justify-between">
              <span>Prompt / Completion</span>
              <span>{(stats.tokens.totalPrompt/1000).toFixed(1)}k / {(stats.tokens.totalCompletion/1000).toFixed(1)}k</span>
            </div>
          </div>

          {/* Recent calls (expanded) */}
          {expanded && stats.recent.length > 0 && (
            <div className="border-t pt-2 space-y-1 max-h-48 overflow-auto">
              <span className="text-[10px] text-muted-foreground">最近调用</span>
              {stats.recent.slice(0, 10).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className={`size-1.5 rounded-full ${r.success ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="w-12 truncate">{r.operation}</span>
                  <span className="text-muted-foreground w-20 truncate">{r.model.split('/').pop()}</span>
                  <span className="w-10 text-right">{r.tokens}</span>
                  <span className="w-10 text-right">{r.latencyMs}ms</span>
                  <span className="w-12 text-right text-green-600">${r.cost.toFixed(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">暂无调用数据</div>
      )}
    </div>
  )
}
