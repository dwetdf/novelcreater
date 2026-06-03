'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NovelItem {
  id: string
  title: string
  subtitle: string | null
  genre: string[]
  status: string
  chapterCount: number
  updatedAt: string
}

// ─── 新建小说弹窗 ──────────────────────────────────

function CreateNovelDialog({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [genre, setGenre] = useState('')
  const [perspective, setPerspective] = useState('third')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          genre: genre ? genre.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [],
          perspective,
          tense: 'past',
          targetWords: 100000,
        }),
      })
      if (res.ok) {
        onCreated()
        onClose()
      }
    } catch (err) {
      console.error('Create novel failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">新建小说</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">书名 *</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="输入书名..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">一句话简介</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="简短介绍你的故事..."
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">类型标签（逗号分隔）</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="玄幻, 修仙, 热血"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">叙述视角</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={perspective}
              onChange={(e) => setPerspective(e.target.value)}
            >
              <option value="third">第三人称</option>
              <option value="first">第一人称</option>
              <option value="omniscient">第三人称全知</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleCreate} disabled={loading || !title.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            创建
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── 删除确认弹窗 ──────────────────────────────────

function DeleteConfirmDialog({ novel, onDeleted, onClose }: { novel: NovelItem; onDeleted: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await fetch(`/api/novels/${novel.id}`, { method: 'DELETE' })
      onDeleted()
      onClose()
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">删除小说</h2>
        <p className="text-sm text-muted-foreground mb-4">
          确定要删除《{novel.title}》吗？将移入回收站，30天内可恢复。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            删除
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── 主页 ──────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const [novels, setNovels] = useState<NovelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NovelItem | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const fetchNovels = async () => {
    try {
      const res = await fetch('/api/novels')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNovels(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Fetch novels failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNovels()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">我的小说</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {novels.length > 0 ? `共 ${novels.length} 部作品` : '开始你的第一部作品'}
          </p>
        </div>
        <Link href="/novel/new">
          <Button>
            <Plus className="size-4" />
            新建小说
          </Button>
        </Link>
      </div>

      {/* Novel Cards */}
      {novels.length > 0 ? (
        <div className="grid gap-3">
          {novels.map((novel) => (
            <div key={novel.id} className="group relative">
              <Link
                href={`/novel/${novel.id}`}
                className="flex items-center gap-5 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/50 block"
              >
                <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
                  <BookOpen className="size-6 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                    {novel.title}
                  </h3>
                  {novel.subtitle && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{novel.subtitle}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {novel.genre.map((g) => (
                      <span key={g} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                        {g}
                      </span>
                    ))}
                    <span>{novel.chapterCount} 章</span>
                    <span className="capitalize">{novel.status}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground shrink-0 mr-2">
                  更新于 {new Date(novel.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              </Link>

              {/* Context Menu */}
              <button
                className="absolute top-3 right-3 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                onClick={(e) => {
                  e.preventDefault()
                  setMenuOpen(menuOpen === novel.id ? null : novel.id)
                }}
              >
                <MoreHorizontal className="size-4" />
              </button>

              {menuOpen === novel.id && (
                <div className="absolute top-10 right-3 z-10 bg-popover border rounded-lg shadow-md py-1 w-32"
                  onMouseLeave={() => setMenuOpen(null)}
                >
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent"
                    onClick={() => { setMenuOpen(null); router.push(`/novel/${novel.id}`) }}
                  >
                    <Pencil className="size-3.5" /> 编辑
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                    onClick={() => { setMenuOpen(null); setDeleteTarget(novel) }}
                  >
                    <Trash2 className="size-3.5" /> 删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">还没有小说</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            创建你的第一部小说，开始 AI 辅助创作之旅
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            新建小说
          </Button>
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateNovelDialog
          onCreated={fetchNovels}
          onClose={() => setShowCreate(false)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          novel={deleteTarget}
          onDeleted={fetchNovels}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
