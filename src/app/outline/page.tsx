'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  BookOpen, Plus, Trash2, Pencil, ChevronRight, ChevronDown,
  ArrowUp, ArrowDown, Sparkles, Loader2, Wand2, FileText,
  Expand, ArrowRight, GripVertical, X, PenLine as PenLineIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────

interface Chapter {
  id: string; title: string; summary: string | null; sortOrder: number
  status: string; wordCount: number; targetWords: number
  volumeId: string | null; volume: { title: string } | null
  content: string
}

interface Volume { id: string; title: string; sortOrder: number; chapters: Chapter[] }

interface NovelItem { id: string; title: string }

interface AIGenState {
  running: boolean
  step: string // 当前步骤描述
  result: string // 生成结果
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  outline: { label: '大纲', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  drafting: { label: '草稿中', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  draft: { label: '初稿', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  revising: { label: '修订中', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  done: { label: '完成', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

// ─── Main Page ────────────────────────────────────

export default function OutlinePage() {
  const [novels, setNovels] = useState<NovelItem[]>([])
  const [selectedNovel, setSelectedNovel] = useState('')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedVols, setExpandedVols] = useState<Set<string>>(new Set())

  // AI state
  const [aiTheme, setAiTheme] = useState('')
  const [aiGen, setAiGen] = useState<AIGenState>({ running: false, step: '', result: '' })
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)

  // Edit state
  const [editTarget, setEditTarget] = useState<{
    type: 'volume' | 'chapter'; id?: string; volumeId?: string
  } | null>(null)
  const [editForm, setEditForm] = useState({ title: '', summary: '', targetWords: 3000, status: 'outline' })
  const [saving, setSaving] = useState(false)

  // Expanded chapter detail (scene outline)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [sceneOutline, setSceneOutline] = useState<string>('')

  useEffect(() => {
    fetch('/api/novels')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => {
        setNovels(Array.isArray(data) ? data : [])
        if (Array.isArray(data) && data.length > 0) setSelectedNovel(data[0].id)
      })
      .catch(err => console.error('Fetch novels failed:', err))
      .finally(() => setLoading(false))
  }, [])

  const fetchChapters = useCallback(async () => {
    if (!selectedNovel) return
    try {
      const res = await fetch(`/api/novels/${selectedNovel}/chapters`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setChapters(Array.isArray(data) ? data : [])
    } catch (err) { console.error('Fetch chapters failed:', err) }
  }, [selectedNovel])

  useEffect(() => { fetchChapters() }, [fetchChapters])

  // Group into volumes
  const volMap = new Map<string, Volume>()
  const orphans: Chapter[] = []
  for (const ch of chapters) {
    if (ch.volumeId) {
      if (!volMap.has(ch.volumeId)) {
        volMap.set(ch.volumeId, { id: ch.volumeId, title: ch.volume?.title ?? '未命名卷', sortOrder: 0, chapters: [] })
      }
      volMap.get(ch.volumeId)!.chapters.push(ch)
    } else { orphans.push(ch) }
  }
  for (const v of volMap.values()) v.chapters.sort((a, b) => a.sortOrder - b.sortOrder)
  orphans.sort((a, b) => a.sortOrder - b.sortOrder)
  const volumes = Array.from(volMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)

  // ─── AI: 生成完整大纲 ───────────────────────────

  const handleAIGenerateOutline = async () => {
    if (!aiTheme.trim() || !selectedNovel) return
    setAiGen({ running: true, step: '正在生成卷纲结构...', result: '' })

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: selectedNovel,
          operation: 'brainstorm',
          userInstruction: `你是一位专业的小说结构设计师。请根据以下主题生成完整的小说大纲结构。\n\n【主题】${aiTheme}\n\n请严格按照以下JSON格式返回（不要加markdown代码块包裹）：\n{\n  "volumes": [\n    {\n      "title": "卷名",\n      "chapters": [\n        {"title": "章节标题", "summary": "1-2句章节摘要"}\n      ]\n    }\n  ]\n}\n\n要求：3-5卷，每卷6-12章，章节标题要有吸引力。`,
        }),
      })
      const data = await res.json()
      setAiGen(prev => ({ ...prev, step: '解析大纲结构...' }))

      const outline = parseAIOutline(data.content || '')
      if (outline && outline.length > 0) {
        setAiGen(prev => ({ ...prev, step: `正在创建 ${outline.length} 卷...` }))
        await createOutlineFromAI(outline)
        setAiTheme('')
        setAiGen({ running: false, step: '大纲生成完成！', result: `已创建 ${outline.length} 卷，共 ${outline.reduce((s, v) => s + v.chapters.length, 0)} 章` })
      } else {
        setAiGen({ running: false, step: '解析失败', result: 'AI 返回格式无法解析，请重试或手动创建\n\n原始返回：\n' + (data.content || '').slice(0, 500) })
      }
    } catch (err) {
      setAiGen({ running: false, step: '生成失败', result: String(err) })
    }
  }

  const createOutlineFromAI = async (outline: { title: string; chapters: { title: string; summary?: string }[] }[]) => {
    for (const vol of outline) {
      const vRes = await fetch(`/api/novels/${selectedNovel}/volumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: vol.title }),
      })
      const volume = await vRes.json()
      for (const ch of vol.chapters) {
        await fetch(`/api/novels/${selectedNovel}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: ch.title, summary: ch.summary || null, targetWords: 3000, volumeId: volume.id }),
        })
      }
    }
    await fetchChapters()
  }

  // ─── AI: 生成章节细纲 ──────────────────────────

  const handleAIGenerateChapterDetail = async (chapter: Chapter) => {
    setExpandedChapter(chapter.id)
    setSceneOutline('')
    setAiGen({ running: true, step: `正在为「${chapter.title}」生成场景细纲...`, result: '' })

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: selectedNovel,
          chapterId: chapter.id,
          operation: 'brainstorm',
          userInstruction: `你是一位专业的小说写手。请为以下章节生成详细的场景级细纲。\n\n【章节】${chapter.title}\n【摘要】${chapter.summary || '无'}\n\n请将本章拆分为 3-6 个场景。每个场景包含：\n- 场景标题\n- 地点/环境\n- 出场角色\n- 冲突或角色目标\n- 场景结束时发生了什么\n- 情感基调\n\n请用清晰的中文列表格式输出。`,
        }),
      })
      const data = await res.json()
      const outline = data.content || '生成失败'
      setSceneOutline(outline)
      // 持久化细纲，供展开步骤使用
      setSceneOutlines((prev) => ({ ...prev, [chapter.id]: outline }))
      setAiGen({ running: false, step: '', result: '' })
    } catch (err) {
      setSceneOutline('生成失败: ' + String(err))
      setAiGen({ running: false, step: '', result: '' })
    }
  }

  // ─── AI: 章节内容展开 ──────────────────────────

  // 存储每个章节的场景细纲（用于展开时注入上下文）
  const [sceneOutlines, setSceneOutlines] = useState<Record<string, string>>({})

  const handleAIExpandContent = async (chapter: Chapter) => {
    if (!chapter.summary && !sceneOutlines[chapter.id]) {
      setAiGen({ running: false, step: '', result: '请先生成细纲或添加章节摘要' })
      return
    }
    setAiGen({ running: true, step: `正在展开「${chapter.title}」的内容...`, result: '' })

    // 用细纲（如果有）作为展开指导
    const sceneGuide = sceneOutlines[chapter.id]
    const instruction = sceneGuide
      ? `请根据以下场景细纲，将每个场景扩展为完整的小说段落（约${chapter.targetWords}字）。\n\n【章节】${chapter.title}\n【摘要】${chapter.summary || ''}\n\n【场景细纲（严格遵循此结构）】\n${sceneGuide}\n\n要求：每个场景都要写出完整内容，有场景描写、人物对话、动作细节。场景之间自然过渡。保持第三人称过去时。`
      : `请将以下大纲点扩展为完整的小说段落（约${chapter.targetWords}字）。\n\n【章节】${chapter.title}\n【摘要】${chapter.summary}\n\n要求：有场景描写、人物对话、动作细节。保持第三人称过去时。`

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: selectedNovel,
          chapterId: chapter.id,
          operation: 'expand',
          userInstruction: instruction,
        }),
      })
      const data = await res.json()
      if (data.content) {
        await fetch(`/api/novels/${selectedNovel}/chapters/${chapter.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: data.content, status: 'draft' }),
        })
        await fetchChapters()
        setAiGen({ running: false, step: '内容展开完成！', result: '' })
      }
    } catch (err) {
      setAiGen({ running: false, step: '', result: '展开失败: ' + String(err) })
    }
  }

  // ─── CRUD ───────────────────────────────────────

  const handleCreate = async (type: 'volume' | 'chapter', volumeId?: string) => {
    if (!selectedNovel) return
    setSaving(true)
    try {
      if (type === 'volume') {
        await fetch(`/api/novels/${selectedNovel}/volumes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editForm.title || '新卷', summary: editForm.summary }),
        })
      } else {
        await fetch(`/api/novels/${selectedNovel}/chapters`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editForm.title || '新章节', summary: editForm.summary, targetWords: editForm.targetWords, status: editForm.status, volumeId: volumeId || null }),
        })
      }
      await fetchChapters()
      setEditTarget(null)
      setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' })
    } catch (err) { console.error('Create failed:', err) }
    finally { setSaving(false) }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    try {
      await fetch(`/api/novels/${selectedNovel}/chapters/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      await fetchChapters()
      setEditTarget(null)
    } catch (err) { console.error('Update failed:', err) }
    finally { setSaving(false) }
  }

  const handleDelete = async (type: 'volume' | 'chapter', id: string) => {
    if (!confirm(`确定删除吗？`)) return
    try {
      if (type === 'volume') await fetch(`/api/novels/${selectedNovel}/volumes?id=${id}`, { method: 'DELETE' })
      else await fetch(`/api/novels/${selectedNovel}/chapters/${id}`, { method: 'DELETE' })
      await fetchChapters()
    } catch (err) { console.error('Delete failed:', err) }
  }

  const handleMove = async (chapterId: string, direction: 'up' | 'down') => {
    try {
      await fetch(`/api/novels/${selectedNovel}/chapters/${chapterId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      await fetchChapters()
    } catch (err) { console.error('Move failed:', err) }
  }

  // ─── Render ─────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">大纲管理</h1>
          <p className="text-sm text-muted-foreground mt-1">主题 → 卷纲 → 章纲 → 细纲 → 内容展开</p>
        </div>
      </div>

      {novels.length === 0 ? (
        <div className="text-center py-12"><BookOpen className="size-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground">请先创建一部小说</p></div>
      ) : (
        <>
          {/* Novel Selector */}
          <div className="flex items-center gap-3 mb-6">
            <select className="rounded-md border bg-background px-3 py-1.5 text-sm" value={selectedNovel} onChange={e => setSelectedNovel(e.target.value)}>
              {novels.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
            <Button size="sm" onClick={() => { setEditTarget({ type: 'volume' }); setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' }) }}><Plus className="size-3.5" /> 新建卷</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditTarget({ type: 'chapter' }); setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' }) }}><Plus className="size-3.5" /> 新建章节</Button>
          </div>

          {/* ─── AI 生成大纲区域 ─────────────────── */}
          <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="size-5 text-primary" />
              <span className="font-semibold text-sm">AI 一键生成大纲</span>
              <span className="text-xs text-muted-foreground">输入主题 → 自动生成卷章结构</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="例如：废柴少年意外获得上古剑灵传承，踏上逆天修仙之路，揭开万年前神魔大战的真相..."
                value={aiTheme}
                onChange={e => setAiTheme(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAIGenerateOutline() }}
              />
              <Button onClick={handleAIGenerateOutline} disabled={aiGen.running || !aiTheme.trim()} className="gap-2" size="sm">
                {aiGen.running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {aiGen.running ? '生成中...' : '生成大纲'}
              </Button>
            </div>
            {aiGen.running && (
              <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {aiGen.step}
              </div>
            )}
            {aiGen.result && !aiGen.running && (
              <div className={`mt-3 text-sm p-3 rounded-lg ${aiGen.result.startsWith('已创建') ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                {aiGen.result.slice(0, 500)}
                <button className="ml-2 underline text-xs" onClick={() => setAiGen({ running: false, step: '', result: '' })}>关闭</button>
              </div>
            )}
          </div>

          {/* Edit Dialog */}
          {editTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditTarget(null)}>
              <div className="bg-background rounded-xl border shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold mb-4">{editTarget.id ? '编辑' : '新建'}{editTarget.type === 'volume' ? '卷' : '章节'}</h3>
                <div className="space-y-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">标题 *</label><input className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} autoFocus /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">摘要</label><textarea className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={2} value={editForm.summary} onChange={e => setEditForm({ ...editForm, summary: e.target.value })} /></div>
                  {editTarget.type === 'chapter' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-muted-foreground mb-1 block">目标字数</label><input type="number" className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm" value={editForm.targetWords} onChange={e => setEditForm({ ...editForm, targetWords: parseInt(e.target.value) || 3000 })} /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">状态</label><select className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>取消</Button>
                  <Button size="sm" onClick={() => editTarget.id ? handleUpdate(editTarget.id!) : handleCreate(editTarget.type, editTarget.volumeId)} disabled={saving || !editForm.title.trim()}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{editTarget.id ? '保存' : '创建'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Chapter Tree */}
          {chapters.length === 0 && volumes.length === 0 ? (
            <div className="text-center py-12 border rounded-lg">
              <BookOpen className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">还没有章节结构</p>
              <p className="text-xs text-muted-foreground">输入主题后点击"生成大纲"，AI 将自动创建卷章结构</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Volumes */}
              {volumes.map(vol => (
                <div key={vol.id} className="rounded-lg border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
                    <button onClick={() => { const n = new Set(expandedVols); if (n.has(vol.id)) n.delete(vol.id); else n.add(vol.id); setExpandedVols(n) }}>
                      {expandedVols.has(vol.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <span className="font-semibold text-sm">{vol.title}</span>
                    <span className="text-xs text-muted-foreground">{vol.chapters.length} 章</span>
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => { setEditTarget({ type: 'chapter', volumeId: vol.id }); setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' }) }}><Plus className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete('volume', vol.id)}><Trash2 className="size-3.5 text-muted-foreground" /></Button>
                  </div>
                  {expandedVols.has(vol.id) && (
                    <div className="divide-y">
                      {vol.chapters.map((ch, idx) => (
                        <ChapterRow key={ch.id} chapter={ch} isFirst={idx === 0} isLast={idx === vol.chapters.length - 1}
                          novelId={selectedNovel}
                          onEdit={() => { setEditTarget({ type: 'chapter', id: ch.id }); setEditForm({ title: ch.title, summary: ch.summary || '', targetWords: ch.targetWords, status: ch.status }) }}
                          onDelete={() => handleDelete('chapter', ch.id)}
                          onMoveUp={() => handleMove(ch.id, 'up')} onMoveDown={() => handleMove(ch.id, 'down')}
                          onGenerateDetail={() => handleAIGenerateChapterDetail(ch)}
                          onExpandContent={() => handleAIExpandContent(ch)}
                          isExpanded={expandedChapter === ch.id}
                          sceneOutline={expandedChapter === ch.id ? sceneOutline : ''}
                          onCloseDetail={() => { setExpandedChapter(null); setSceneOutline('') }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {/* Orphans */}
              {orphans.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="px-4 py-2 bg-muted/30 border-b text-sm font-medium text-muted-foreground">未分类章节</div>
                  <div className="divide-y">
                    {orphans.map((ch, idx) => (
                      <ChapterRow key={ch.id} chapter={ch} isFirst={idx === 0} isLast={idx === orphans.length - 1}
                        novelId={selectedNovel}
                        onEdit={() => { setEditTarget({ type: 'chapter', id: ch.id }); setEditForm({ title: ch.title, summary: ch.summary || '', targetWords: ch.targetWords, status: ch.status }) }}
                        onDelete={() => handleDelete('chapter', ch.id)}
                        onMoveUp={() => handleMove(ch.id, 'up')} onMoveDown={() => handleMove(ch.id, 'down')}
                        onGenerateDetail={() => handleAIGenerateChapterDetail(ch)}
                        onExpandContent={() => handleAIExpandContent(ch)}
                        isExpanded={expandedChapter === ch.id}
                        sceneOutline={expandedChapter === ch.id ? sceneOutline : ''}
                        onCloseDetail={() => { setExpandedChapter(null); setSceneOutline('') }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Chapter Row ──────────────────────────────────

function ChapterRow({ chapter, isFirst, isLast, onEdit, onDelete, onMoveUp, onMoveDown, onGenerateDetail, onExpandContent, isExpanded, sceneOutline, onCloseDetail, novelId }: {
  chapter: Chapter; isFirst: boolean; isLast: boolean
  onEdit: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
  onGenerateDetail: () => void; onExpandContent: () => void
  isExpanded: boolean; sceneOutline: string; onCloseDetail: () => void
  novelId: string
}) {
  const statusInfo = STATUS_MAP[chapter.status] ?? { label: chapter.status, color: 'bg-muted' }
  const writeUrl = `/novel/${novelId}/write?chapterId=${chapter.id}`

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors group">
        <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="p-0.5 hover:bg-accent rounded disabled:opacity-30" onClick={onMoveUp} disabled={isFirst}><ArrowUp className="size-3 text-muted-foreground" /></button>
          <button className="p-0.5 hover:bg-accent rounded disabled:opacity-30" onClick={onMoveDown} disabled={isLast}><ArrowDown className="size-3 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{chapter.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
          {chapter.summary && <p className="text-xs text-muted-foreground truncate mt-0.5">{chapter.summary}</p>}
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {chapter.wordCount} / {chapter.targetWords} 字
            {chapter.content
              ? <span className="text-green-600"> · 有内容</span>
              : <span className="text-amber-600"> · 待展开</span>
            }
          </div>
          {chapter.content && (
            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5 italic">
              {chapter.content.replace(/<[^>]*>/g, '').slice(0, 60)}...
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <a href={writeUrl} className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-blue-600 no-underline" title="去写作">
            <PenLineIcon className="size-3" /> 写作
          </a>
          <button className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-primary" onClick={onGenerateDetail} title="生成场景细纲">
            <Sparkles className="size-3" /> 细纲
          </button>
          <button className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-green-600" onClick={onExpandContent} title="展开章节内容">
            <Expand className="size-3" /> 展开
          </button>
          <button className="p-1 hover:bg-accent rounded" onClick={onEdit}><Pencil className="size-3 text-muted-foreground" /></button>
          <button className="p-1 hover:bg-accent rounded" onClick={onDelete}><Trash2 className="size-3 text-muted-foreground" /></button>
        </div>
      </div>

      {/* Expanded Scene Detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 mx-4 mb-2 border-t">
          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-xs font-semibold flex items-center gap-1.5"><FileText className="size-3.5" /> 场景细纲</span>
            <button onClick={onCloseDetail} className="p-0.5 hover:bg-accent rounded"><X className="size-3.5" /></button>
          </div>
          <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-64 overflow-auto leading-relaxed">
            {sceneOutline || <span className="text-muted-foreground italic">加载中...</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Response Parser ───────────────────────────

function parseAIOutline(text: string): { title: string; chapters: { title: string; summary?: string }[] }[] | null {
  try {
    const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    const jsonStr = codeBlock ? codeBlock[1] : text.match(/\{[\s\S]*\}/)?.[0]
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr)
      if (parsed.volumes && Array.isArray(parsed.volumes)) {
        return parsed.volumes.map((v: any) => ({
          title: String(v.title ?? '未命名卷'),
          chapters: Array.isArray(v.chapters) ? v.chapters.map((c: any) => ({ title: String(c.title ?? '未命名章'), summary: c.summary ? String(c.summary) : undefined })) : [],
        }))
      }
    }
    // Try text parsing
    const lines = text.split('\n').filter(l => l.trim())
    const result: { title: string; chapters: { title: string; summary?: string }[] }[] = []
    let cur: { title: string; chapters: { title: string; summary?: string }[] } | null = null
    for (const line of lines) {
      const vm = line.match(/第[一二三四五六七八九十\d]+卷[：:\s]*(.+)/)
      if (vm) { if (cur) result.push(cur); cur = { title: vm[1].trim(), chapters: [] }; continue }
      const cm = line.match(/第[一二三四五六七八九十\d]+章[：:\s]*(.+)/)
      if (cm && cur) { cur.chapters.push({ title: cm[1].trim() }) }
    }
    if (cur && cur.chapters.length > 0) result.push(cur)
    return result.length > 0 ? result : null
  } catch { return null }
}
