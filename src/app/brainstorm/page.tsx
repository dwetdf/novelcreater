'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Lightbulb, Loader2, Send, Sparkles } from 'lucide-react'

export default function BrainstormPage() {
  const [novels, setNovels] = useState<{ id: string; title: string }[]>([])
  const [selectedNovel, setSelectedNovel] = useState('')
  const [instruction, setInstruction] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingNovels, setLoadingNovels] = useState(true)

  useEffect(() => {
    fetch('/api/novels')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        setNovels(Array.isArray(data) ? data : [])
        if (Array.isArray(data) && data.length > 0) setSelectedNovel(data[0].id)
      })
      .catch((err) => console.error('Fetch novels failed:', err))
      .finally(() => setLoadingNovels(false))
  }, [])

  const suggestions = [
    '主角被围困在城中，给出3个出人意料的脱困方案',
    '设计一个让读者意想不到的剧情反转',
    '为反派设计一个令人同情的背景故事',
    '给出5个能增加故事张力的冲突点子',
    '如何让两个角色的关系从敌对变成同盟？',
    '设计一个独特的修炼/魔法体系',
  ]

  const handleSubmit = async () => {
    if (!instruction.trim() || !selectedNovel) return
    setLoading(true)
    setResponse('')

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: selectedNovel,
          chapterId: 'brainstorm', // special marker
          operation: 'brainstorm',
          userInstruction: instruction,
        }),
      })
      const data = await res.json()
      setResponse(data.content || 'AI 返回为空，请检查 API 配置')
    } catch (err) {
      setResponse('请求失败：' + String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
        <Lightbulb className="size-6" />
        头脑风暴
      </h1>
      <p className="text-sm text-muted-foreground mb-6">让 AI 帮你激发创意、设计情节、解决写作瓶颈</p>

      {loadingNovels ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : novels.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">请先创建一部小说</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Novel Selector */}
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={selectedNovel}
            onChange={(e) => setSelectedNovel(e.target.value)}
          >
            {novels.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>

          {/* Quick Suggestions */}
          <div>
            <h3 className="text-sm font-medium mb-2">快速提问</h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent transition-colors text-left"
                  onClick={() => setInstruction(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <div>
            <textarea
              className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={4}
              placeholder="描述你的写作困境或创意需求..."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <Button onClick={handleSubmit} disabled={loading || !instruction.trim()} className="gap-1.5">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                发送
              </Button>
            </div>
          </div>

          {/* Response */}
          {response && (
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm font-medium">AI 回复</span>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{response}</div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground ml-2">AI 正在思考...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
