'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'

interface ForeshadowingItem {
  id: string; content: string; type: string; status: string
  plantChapter: { title: string; sortOrder: number } | null
  planRecycleChapter: { title: string; sortOrder: number } | null
  actualRecycleChapter: { title: string; sortOrder: number } | null
  plantPosition: string | null; notes: string | null; createdAt: string
}

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  planted: { label: '已埋设', icon: Plus, color: 'text-amber-600' },
  planned: { label: '计划回收', icon: Eye, color: 'text-blue-600' },
  closed: { label: '已回收', icon: CheckCircle, color: 'text-green-600' },
  discarded: { label: '已废弃', icon: XCircle, color: 'text-gray-400' },
}

const TYPE_LABELS: Record<string, string> = {
  item: '物品', identity: '身份', dialogue: '对话', event: '事件', other: '其他',
}

export default function ForeshadowingsPage() {
  const { id: novelId } = useParams<{ id: string }>()
  const [items, setItems] = useState<ForeshadowingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  const fetchItems = async () => {
    try {
      const url = filter
        ? `/api/novels/${novelId}/foreshadowings?status=${filter}`
        : `/api/novels/${novelId}/foreshadowings`
      const res = await fetch(url)
      if (res.ok) setItems(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [novelId, filter])

  const handleMarkClosed = async (id: string) => {
    await fetch(`/api/novels/${novelId}/foreshadowings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'closed' }),
    })
    fetchItems()
  }

  const handleMarkDiscarded = async (id: string) => {
    await fetch(`/api/novels/${novelId}/foreshadowings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'discarded' }),
    })
    fetchItems()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  const planted = items.filter(i => i.status === 'planted').length
  const planned = items.filter(i => i.status === 'planned').length
  const closed = items.filter(i => i.status === 'closed').length
  const discarded = items.filter(i => i.status === 'discarded').length

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1">伏笔管理</h1>
      <p className="text-sm text-muted-foreground mb-6">追踪伏笔的埋设、计划回收和实际回收状态</p>

      {/* Stats */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="text-amber-600">已埋设 {planted}</span>
        <span className="text-blue-600">计划回收 {planned}</span>
        <span className="text-green-600">已回收 {closed}</span>
        <span className="text-gray-400">已废弃 {discarded}</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['', 'planted', 'planned', 'closed', 'discarded'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1 rounded-full border ${filter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
            {s ? STATUS_MAP[s].label : '全部'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无伏笔。展开章节后 AI 会自动检测新埋设的伏笔。
          </p>
        )}
        {items.map(item => {
          const StatusIcon = STATUS_MAP[item.status]?.icon || Plus
          return (
            <div key={item.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <StatusIcon className={`size-4 mt-0.5 ${STATUS_MAP[item.status]?.color || ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.content}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[item.type] || item.type}</span>
                    <span>{STATUS_MAP[item.status]?.label}</span>
                    {item.plantChapter && (
                      <span>埋于 第{item.plantChapter.sortOrder}章「{item.plantChapter.title}」</span>
                    )}
                    {item.planRecycleChapter && (
                      <span>→ 计划回收于 第{item.planRecycleChapter.sortOrder}章</span>
                    )}
                    {item.actualRecycleChapter && (
                      <span>→ 实际回收于 第{item.actualRecycleChapter.sortOrder}章</span>
                    )}
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                </div>
                {(item.status === 'planted' || item.status === 'planned') && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleMarkClosed(item.id)}
                      className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200">
                      已回收
                    </button>
                    <button onClick={() => handleMarkDiscarded(item.id)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                      废弃
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
