'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PenLine, BookOpen, Users, Globe, ArrowRight, Loader2, Download, FileText } from 'lucide-react'

interface NovelData {
  id: string
  title: string
  subtitle: string | null
  genre: string | null
  status: string
  totalWords: number
  perspective: string
  _count: { chapters: number; characters: number }
  volumes: { id: string; title: string }[]
}

export default function NovelDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [novel, setNovel] = useState<NovelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/novels/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        if (data.error) router.push('/')
        else setNovel(data)
      })
      .catch((err) => { console.error('Fetch novel failed:', err); router.push('/') })
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const handleExport = (format: 'txt' | 'md') => {
    window.open(`/api/novels/${id}/export?format=${format}`, '_blank')
  }

  if (!novel) return null

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      {/* Novel Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">{novel.title}</h1>
        {novel.subtitle && (
          <p className="text-muted-foreground mt-2">{novel.subtitle}</p>
        )}
        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
          <span>{novel.totalWords.toLocaleString()} 字</span>
          <span>{novel._count.chapters} 章</span>
          <span>{novel._count.characters} 个角色</span>
          <span className="capitalize">{novel.status}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <Link href={`/novel/${id}/write`}>
          <Button className="w-full h-24 flex-col gap-2" variant="outline">
            <PenLine className="size-6" />
            <span>继续写作</span>
          </Button>
        </Link>
        <Link href={`/novel/${id}/outline`}>
          <Button className="w-full h-24 flex-col gap-2" variant="outline">
            <BookOpen className="size-6" />
            <span>大纲管理</span>
          </Button>
        </Link>
        <Link href={`/novel/${id}/characters`}>
          <Button className="w-full h-24 flex-col gap-2" variant="outline">
            <Users className="size-6" />
            <span>角色管理</span>
          </Button>
        </Link>
      </div>

      {/* Export */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Download className="size-5" />
          导出
        </h2>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handleExport('txt')}
          >
            <FileText className="size-4" />
            导出 TXT
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handleExport('md')}
          >
            <FileText className="size-4" />
            导出 Markdown
          </Button>
        </div>
      </div>

      {/* Volume List */}
      {novel.volumes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">卷结构</h2>
          <div className="space-y-2">
            {novel.volumes.map((vol, i) => (
              <div
                key={vol.id}
                className="flex items-center gap-3 rounded-lg border p-4"
              >
                <span className="text-sm text-muted-foreground font-mono">
                  卷 {i + 1}
                </span>
                <span className="font-medium">{vol.title}</span>
                <ArrowRight className="size-4 text-muted-foreground ml-auto" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
