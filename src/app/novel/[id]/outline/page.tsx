'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  BookOpen, Plus, Trash2, Pencil, ChevronRight, ChevronDown,
  ArrowUp, ArrowDown, Sparkles, Loader2, Wand2, FileText,
  Expand, GripVertical, X, PenLine as PenLineIcon, Users,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────

interface Chapter {
  id: string; title: string; summary: string | null; sortOrder: number
  status: string; wordCount: number; targetWords: number
  volumeId: string | null; volume: { title: string } | null
  content: string
}

interface Volume { id: string; title: string; sortOrder: number; chapters: Chapter[] }

interface AIGenState {
  running: boolean
  step: string
  result: string
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
  const { id: novelId } = useParams<{ id: string }>()
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedVols, setExpandedVols] = useState<Set<string>>(new Set())


  // AI state
  const [aiTheme, setAiThemeState] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem(`theme_${novelId}`) || ''
    return ''
  })
  const setAiTheme = (val: string) => {
    setAiThemeState(val)
    if (typeof window !== 'undefined') {
      try { sessionStorage.setItem(`theme_${novelId}`, val) } catch { /* ignore */ }
    }
  }
  const [aiVolumeCount, setAiVolumeCount] = useState(4)
  const [aiChapterCount, setAiChapterCount] = useState(10)
  const [aiGen, _setAiGen] = useState<AIGenState>({ running: false, step: '', result: '' })
  const setAiGen = (val: AIGenState | ((prev: AIGenState) => AIGenState)) => {
    if (mountedRef.current) _setAiGen(val)
  }

  // World-building generation state (persisted to sessionStorage)
  const [worldBuilding, setWorldBuildingState] = useState<{
    characters: Array<Record<string, string>>
    factions: Array<Record<string, string>>
    worldRules: Array<Record<string, string>>
  } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(`wb_${novelId}`)
        if (cached) return JSON.parse(cached)
      } catch { /* ignore */ }
    }
    return null
  })
  const setWorldBuilding = (val: Parameters<typeof setWorldBuildingState>[0]) => {
    setWorldBuildingState(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      if (typeof window !== 'undefined') {
        try {
          if (next) sessionStorage.setItem(`wb_${novelId}`, JSON.stringify(next))
          else sessionStorage.removeItem(`wb_${novelId}`)
        } catch { /* ignore */ }
      }
      return next
    })
  }
  const [wbSaving, setWbSaving] = useState(false)

  // Edit state
  const [editTarget, setEditTarget] = useState<{
    type: 'volume' | 'chapter'; id?: string; volumeId?: string
  } | null>(null)
  const [editForm, setEditForm] = useState({ title: '', summary: '', targetWords: 3000, status: 'outline' })
  const [saving, setSaving] = useState(false)

  // Expanded chapter detail (scene outline) — now structured from ChapterScene
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Array<{
    id?: string; chapterId?: string; seq: number
    title: string; setting: string; characters: string
    conflict: string; outcome: string; emotionalBeat: string; notes: string
  }>>([])
  const [scenesLoading, setScenesLoading] = useState(false)

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setChapters(Array.isArray(data) ? data : [])
    } catch (err) { console.error('Fetch chapters failed:', err) }
    finally { setLoading(false) }
  }, [novelId])

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

  // State for generated outline preview (persisted to sessionStorage)
  const [generatedOutline, setGeneratedOutlineState] = useState<{
    volumes: { title: string; summary: string; chapters: { title: string; summary: string; targetWords: number }[] }[]
  } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(`outline_${novelId}`)
        if (cached) return JSON.parse(cached)
      } catch { /* ignore */ }
    }
    return null
  })
  const setGeneratedOutline = (val: Parameters<typeof setGeneratedOutlineState>[0]) => {
    setGeneratedOutlineState(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      if (typeof window !== 'undefined') {
        try {
          if (next) sessionStorage.setItem(`outline_${novelId}`, JSON.stringify(next))
          else sessionStorage.removeItem(`outline_${novelId}`)
        } catch { /* ignore */ }
      }
      return next
    })
  }

  // ─── AI: 生成世界观 & 角色 ─────────────────────

  const handleGenerateWorldBuilding = async () => {
    if (!aiTheme.trim()) return
    setAiGen({ running: true, step: '正在生成角色与世界设定...', result: '' })
    setWorldBuilding(null)

    try {
      const res = await fetch(`/api/novels/${novelId}/generate-worldbuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: aiTheme }),
      })
      const data = await res.json()
      if (data.error) {
        setAiGen({ running: false, step: '', result: '生成失败：' + data.error })
        return
      }
      setWorldBuilding(data)
      setAiGen({ running: false, step: '',
        result: `生成 ${data.characters?.length || 0} 个角色、${data.factions?.length || 0} 个势力、${data.worldRules?.length || 0} 条规则` })
    } catch (err) {
      setAiGen({ running: false, step: '', result: '生成失败：' + String(err) })
    }
  }

  const handleSaveWorldBuilding = async () => {
    if (!worldBuilding) return
    setWbSaving(true)
    try {
      // Save characters
      for (const c of worldBuilding.characters) {
        await fetch(`/api/novels/${novelId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        })
      }
      // Save factions
      for (const f of worldBuilding.factions) {
        await fetch(`/api/novels/${novelId}/factions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(f),
        })
      }
      // Save world rules
      for (const r of worldBuilding.worldRules) {
        await fetch(`/api/novels/${novelId}/world-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        })
      }
      setAiGen({ running: false, step: '', result: '角色与世界设定已保存！可以继续生成大纲。' })
      setWorldBuilding(null)
      if (typeof window !== 'undefined') sessionStorage.removeItem(`wb_${novelId}`)
    } catch (err) {
      setAiGen({ running: false, step: '', result: '保存失败：' + String(err) })
    } finally {
      setWbSaving(false)
    }
  }

  // ─── AI: 生成完整大纲（使用 OutlineGenerator 引擎）───

  const handleAIGenerateOutline = async () => {
    if (!aiTheme.trim()) return
    setAiGen({ running: true, step: '正在生成卷纲结构...', result: '' })
    setGeneratedOutline(null)

    try {
      const res = await fetch(`/api/novels/${novelId}/outline/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: aiTheme, volumeCount: aiVolumeCount, chapterCount: aiChapterCount }),
      })
      const data = await res.json()

      if (data.error) {
        setAiGen({ running: false, step: '生成失败', result: data.error })
        return
      }

      const vols = data.volumes
      if (vols && vols.length > 0) {
        setGeneratedOutline({
          volumes: vols.map((v: { title: string; summary: string; chapters: { title: string; summary: string; targetWords: number }[] }) => ({
            title: v.title,
            summary: v.summary,
            chapters: v.chapters.map((c: { title: string; summary: string; targetWords: number }) => ({
              title: c.title,
              summary: c.summary,
              targetWords: c.targetWords || 3000,
            })),
          })),
        })
        setAiGen({ running: false, step: '预览', result: `生成 ${vols.length} 卷，共 ${vols.reduce((s: number, v: { chapters: unknown[] }) => s + v.chapters.length, 0)} 章。请确认后保存。` })
      } else {
        setAiGen({ running: false, step: '解析失败', result: '未能解析大纲结构，请重试' })
      }
    } catch (err) {
      setAiGen({ running: false, step: '生成失败', result: String(err) })
    }
  }

  // Edit generated outline before commit
  const updateGeneratedChapter = (vi: number, ci: number, patch: Partial<{ title: string; summary: string; targetWords: number }>) => {
    if (!generatedOutline) return
    const vols = [...generatedOutline.volumes]
    const chapters = [...vols[vi].chapters]
    chapters[ci] = { ...chapters[ci], ...patch }
    vols[vi] = { ...vols[vi], chapters }
    setGeneratedOutline({ volumes: vols })
  }

  // ─── 确认并保存大纲（事务批量落库）────────────────

  const handleCommitOutline = async () => {
    if (!generatedOutline) return
    setAiGen({ running: true, step: '正在保存大纲...', result: '' })

    try {
      const res = await fetch(`/api/novels/${novelId}/outline/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumes: generatedOutline.volumes }),
      })
      const data = await res.json()

      if (data.error) {
        setAiGen({ running: false, step: '保存失败', result: data.error })
        return
      }

      setAiTheme('')
      setGeneratedOutline(null)
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`theme_${novelId}`)
        sessionStorage.removeItem(`outline_${novelId}`)
      }
      setAiGen({ running: false, step: '大纲保存完成！', result: `已创建 ${data.volumes.length} 卷，共 ${data.totalChapters} 章` })
      await fetchChapters()
    } catch (err) {
      setAiGen({ running: false, step: '保存失败', result: String(err) })
    }
  }

  // ─── AI: 单卷细化 ─────────────────────────────

  const [refiningVolume, setRefiningVolume] = useState<string | null>(null)

  const handleRefineVolume = async (volId: string) => {
    setRefiningVolume(volId)
    try {
      const res = await fetch(`/api/novels/${novelId}/outline/refine-volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumeId: volId }),
      })
      const data = await res.json()
      if (data.error) {
        setAiGen({ running: false, step: '', result: '卷细化失败：' + data.error })
        return
      }
      // Auto-create suggested chapters
      if (data.suggestedChapters && data.suggestedChapters.length > 0) {
        for (const ch of data.suggestedChapters) {
          await fetch(`/api/novels/${novelId}/chapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: ch.title, summary: ch.summary || null, targetWords: 3000, volumeId: volId }),
          })
        }
        // Update volume summary if refined
        if (data.volumeSummary) {
          await fetch(`/api/novels/${novelId}/volumes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volumeId: volId, summary: data.volumeSummary }),
          })
        }
        await fetchChapters()
        setAiGen({ running: false, step: '', result: `卷细化完成：新增 ${data.suggestedChapters.length} 章` })
      }
    } catch (err) {
      setAiGen({ running: false, step: '', result: '卷细化失败：' + String(err) })
    } finally {
      setRefiningVolume(null)
    }
  }

  // ─── AI: 生成章节细纲 ──────────────────────────

  // ─── Load existing scenes for a chapter ──────────

  const loadScenes = async (chapterId: string) => {
    setScenesLoading(true)
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setScenes(data.map((s: Record<string, unknown>) => ({
            id: s.id as string,
            chapterId: s.chapterId as string,
            seq: s.seq as number,
            title: (s.title as string) || '',
            setting: (s.setting as string) || '',
            characters: typeof s.characters === 'string' ? s.characters as string : JSON.stringify(s.characters),
            conflict: (s.conflict as string) || '',
            outcome: (s.outcome as string) || '',
            emotionalBeat: (s.emotionalBeat as string) || '',
            notes: (s.notes as string) || '',
          })))
          return
        }
      }
      setScenes([])
    } catch { setScenes([]) }
    finally { setScenesLoading(false) }
  }

  // ─── AI: 生成章节细纲（使用 scenes/generate API）───

  const handleAIGenerateChapterDetail = async (chapter: Chapter) => {
    setExpandedChapter(chapter.id)
    setScenes([])
    setScenesLoading(true)
    setAiGen({ running: true, step: `正在为「${chapter.title}」生成场景细纲...`, result: '' })

    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapter.id}/scenes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()

      if (data.error) {
        setAiGen({ running: false, step: '', result: '生成失败：' + data.error })
        setScenesLoading(false)
        return
      }

      const generated = (data.scenes || []).map((s: Record<string, unknown>, i: number) => ({
        seq: i + 1,
        title: (s.title as string) || `场景 ${i + 1}`,
        setting: (s.setting as string) || '',
        characters: Array.isArray(s.characters) ? (s.characters as string[]).join('、') : '',
        conflict: (s.conflict as string) || '',
        outcome: (s.outcome as string) || '',
        emotionalBeat: (s.emotionalBeat as string) || '',
        notes: (s.notes as string) || '',
      }))

      setScenes(generated)
      // Auto-save to DB immediately so scenes survive page navigation
      await handleSaveScenesImmediate(chapter.id, generated)
      setAiGen({ running: false, step: '', result: `生成 ${generated.length} 个场景并已自动保存` })
    } catch (err) {
      setAiGen({ running: false, step: '', result: '生成失败：' + String(err) })
    } finally {
      setScenesLoading(false)
    }
  }

  // ─── Save scenes to DB ─────────────────────────

  // Immediate save with explicit data (used after AI generation, before state update)
  const handleSaveScenesImmediate = async (chapterId: string, sceneData: Array<Record<string, string>>) => {
    try {
      // Delete existing scenes
      const existing = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes`).then(r => r.json())
      for (const s of (Array.isArray(existing) ? existing : [])) {
        if (s.id) {
          await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes?sceneId=${s.id}`, { method: 'DELETE' })
        }
      }
      // Create new scenes
      for (const s of sceneData) {
        await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s),
        })
      }
    } catch (err) {
      console.error('Auto-save scenes failed:', err)
    }
  }

  const handleSaveScenes = async (chapterId: string) => {
    setSaving(true)
    try {
      // Delete existing scenes for this chapter
      const existing = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes`).then(r => r.json())
      for (const s of (Array.isArray(existing) ? existing : [])) {
        if (s.id) {
          await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes?sceneId=${s.id}`, { method: 'DELETE' })
        }
      }
      // Create new scenes
      for (const s of scenes) {
        await fetch(`/api/novels/${novelId}/chapters/${chapterId}/scenes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s),
        })
      }
      setAiGen({ running: false, step: '', result: `已保存 ${scenes.length} 个场景` })
      // Reload to get IDs
      setTimeout(() => loadScenes(chapterId), 300)
    } catch (err) {
      setAiGen({ running: false, step: '', result: '保存失败：' + String(err) })
    } finally {
      setSaving(false)
    }
  }

  // ─── AI: 章节内容展开（使用 ContentExpander 引擎）───

  const [expandWarnings, setExpandWarnings] = useState<string[]>([])

  const handleAIExpandContent = async (chapter: Chapter) => {
    // Already has content → confirm before overwriting
    if (chapter.wordCount > 0 && chapter.content) {
      if (!confirm(`「${chapter.title}」已有 ${chapter.wordCount.toLocaleString()} 字内容。\n\n重新展开将覆盖已编辑的内容（包括在写作页的修改）。\n\n向量索引、摘要也会重建。\n\n确定要重新展开吗？`)) {
        return
      }
    }
    // Check if scenes exist
    let hasScenes = false
    try {
      const checkRes = await fetch(`/api/novels/${novelId}/chapters/${chapter.id}/scenes`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        hasScenes = Array.isArray(checkData) && checkData.length > 0
      }
    } catch { /* ignore */ }

    if (!hasScenes) {
      setAiGen({ running: false, step: '', result: `「${chapter.title}」还没有场景细纲。请先点「细纲」生成后再「展开」。` })
      return
    }

    setAiGen({ running: true, step: `正在展开「${chapter.title}」...`, result: '' })
    setExpandWarnings([])

    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapter.id}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json()

      if (data.error) {
        setAiGen({ running: false, step: '', result: '展开失败：' + data.error })
        return
      }

      await fetchChapters()

      // 触发写时索引（分块+嵌入+摘要）
      fetch(`/api/novels/${novelId}/chapters/${chapter.id}/index`, { method: 'POST' }).catch(() => {})

      if (data.warnings && data.warnings.length > 0) {
        setExpandWarnings(data.warnings)
        setAiGen({ running: false, step: '',
          result: `展开完成（${data.wordCount?.toLocaleString()} 字，${data.scenesGenerated}/${data.totalScenes} 场景），但有 ${data.warnings.length} 条连续性警告。` })
      } else {
        setAiGen({ running: false, step: '',
          result: `展开完成！${data.wordCount?.toLocaleString()} 字，${data.scenesGenerated} 个场景已生成。` })
      }
    } catch (err) {
      setAiGen({ running: false, step: '', result: '展开失败：' + String(err) })
    }
  }

  // ─── CRUD ───────────────────────────────────────

  const handleCreate = async (type: 'volume' | 'chapter', volumeId?: string) => {
    setSaving(true)
    try {
      if (type === 'volume') {
        await fetch(`/api/novels/${novelId}/volumes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editForm.title || '新卷', summary: editForm.summary }),
        })
      } else {
        await fetch(`/api/novels/${novelId}/chapters`, {
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
      await fetch(`/api/novels/${novelId}/chapters/${id}`, {
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
      if (type === 'volume') await fetch(`/api/novels/${novelId}/volumes?id=${id}`, { method: 'DELETE' })
      else await fetch(`/api/novels/${novelId}/chapters/${id}`, { method: 'DELETE' })
      await fetchChapters()
    } catch (err) { console.error('Delete failed:', err) }
  }

  const handleMove = async (chapterId: string, direction: 'up' | 'down') => {
    try {
      await fetch(`/api/novels/${novelId}/chapters/${chapterId}/move`, {
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

      <div className="flex items-center gap-3 mb-6">
        <Button size="sm" onClick={() => { setEditTarget({ type: 'volume' }); setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' }) }}><Plus className="size-3.5" /> 新建卷</Button>
        <Button size="sm" variant="outline" onClick={() => { setEditTarget({ type: 'chapter' }); setEditForm({ title: '', summary: '', targetWords: 3000, status: 'outline' }) }}><Plus className="size-3.5" /> 新建章节</Button>
      </div>

      {/* ─── Step 1: AI 生成角色与世界设定 ─────────── */}
      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="size-5 text-amber-600" />
          <span className="font-semibold text-sm">Step 1: 生成角色与世界设定</span>
          <span className="text-xs text-muted-foreground">基于主题 → AI 生成角色卡、势力、世界观规则</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="输入故事主题或一句话简介..."
            value={aiTheme}
            onChange={e => setAiTheme(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !aiGen.running) handleGenerateWorldBuilding() }}
          />
          <Button onClick={handleGenerateWorldBuilding} disabled={aiGen.running || !aiTheme.trim()} className="gap-2 bg-amber-600 hover:bg-amber-700" size="sm">
            {aiGen.running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            生成设定
          </Button>
        </div>

        {/* World-building preview */}
        {worldBuilding && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">预览（可编辑后保存）</span>
              <Button size="sm" onClick={handleSaveWorldBuilding} disabled={wbSaving} className="gap-1.5">
                {wbSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                确认并保存设定
              </Button>
            </div>
            {/* Characters */}
            {worldBuilding.characters.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">角色 ({worldBuilding.characters.length})</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {worldBuilding.characters.map((c, i) => (
                    <div key={i} className="rounded border bg-card p-2 text-xs">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <input className="font-medium bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none flex-1"
                          value={c.name || ''} onChange={e => {
                            const ch = [...worldBuilding.characters]; ch[i] = { ...ch[i], name: e.target.value }; setWorldBuilding({ ...worldBuilding, characters: ch })
                          }} />
                        <input className="w-14 text-[10px] bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none text-muted-foreground"
                          value={c.role || ''} onChange={e => {
                            const ch = [...worldBuilding.characters]; ch[i] = { ...ch[i], role: e.target.value }; setWorldBuilding({ ...worldBuilding, characters: ch })
                          }} />
                      </div>
                      <input className="w-full text-[10px] bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none text-muted-foreground"
                        value={c.personality || ''} placeholder="性格描述..."
                        onChange={e => { const ch = [...worldBuilding.characters]; ch[i] = { ...ch[i], personality: e.target.value }; setWorldBuilding({ ...worldBuilding, characters: ch }) }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Factions */}
            {worldBuilding.factions.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">势力 ({worldBuilding.factions.length})</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {worldBuilding.factions.map((f, i) => (
                    <div key={i} className="rounded border bg-card px-2 py-1 text-xs flex items-center gap-1">
                      <input className="font-medium bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-20"
                        value={f.name || ''} onChange={e => {
                          const fa = [...worldBuilding.factions]; fa[i] = { ...fa[i], name: e.target.value }; setWorldBuilding({ ...worldBuilding, factions: fa })
                        }} />
                      <span className="text-muted-foreground">{f.type || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* World Rules */}
            {worldBuilding.worldRules.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">世界观规则 ({worldBuilding.worldRules.length})</span>
                {worldBuilding.worldRules.slice(0, 4).map((r, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-medium">[{r.category}]</span> {r.title}：{r.content?.slice(0, 80)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Step 2: 生成大纲 ─────────────────── */}
      <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="size-5 text-primary" />
          <span className="font-semibold text-sm">Step 2: 生成大纲结构</span>
          <span className="text-xs text-muted-foreground">确认设定后，生成卷章结构</span>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">卷数：</span>
          <select className="rounded-md border bg-background px-2 py-1 text-sm" value={aiVolumeCount} onChange={e => setAiVolumeCount(Number(e.target.value))}>
            {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} 卷</option>)}
          </select>
          <span className="text-xs text-muted-foreground">每卷章数：</span>
          <select className="rounded-md border bg-background px-2 py-1 text-sm" value={aiChapterCount} onChange={e => setAiChapterCount(Number(e.target.value))}>
            {[5,6,7,8,9,10,12,15].map(n => <option key={n} value={n}>{n} 章</option>)}
          </select>
        </div>
        <div className="flex gap-2">
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
          <div className={`mt-3 text-sm p-3 rounded-lg ${aiGen.result.startsWith('已创建') || aiGen.result.startsWith('生成') || aiGen.result.startsWith('预览') || aiGen.result.startsWith('大纲保存') || aiGen.result.startsWith('展开完成') ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
            {aiGen.result.slice(0, 500)}
            <button className="ml-2 underline text-xs" onClick={() => { setAiGen({ running: false, step: '', result: '' }); setExpandWarnings([]) }}>关闭</button>
          </div>
        )}
        {expandWarnings.length > 0 && (
          <div className="mt-2 text-xs p-3 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 max-h-32 overflow-auto">
            <span className="font-semibold">⚠️ 连续性警告：</span>
            {expandWarnings.map((w, i) => (
              <div key={i} className="mt-1">{w}</div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Generated Outline Preview ─────────── */}
      {generatedOutline && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50/30 dark:bg-green-950/10 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="size-4 text-green-600" />
              大纲预览（确认前可编辑）
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setGeneratedOutline(null); setAiGen({ running: false, step: '', result: '' }) }}>
                放弃
              </Button>
              <Button size="sm" onClick={handleCommitOutline} disabled={aiGen.running} className="gap-1.5">
                {aiGen.running ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                确认并保存
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {generatedOutline.volumes.map((vol, vi) => (
              <div key={vi} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <input className="font-semibold text-sm bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-1 py-0.5"
                    value={vol.title} onChange={e => {
                      const vols = [...generatedOutline.volumes]
                      vols[vi] = { ...vols[vi], title: e.target.value }
                      setGeneratedOutline({ volumes: vols })
                    }} />
                  <span className="text-xs text-muted-foreground">{vol.chapters.length} 章</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{vol.summary}</p>
                <div className="space-y-1">
                  {vol.chapters.map((ch, ci) => (
                    <div key={ci} className="flex items-center gap-2 text-sm pl-3 border-l-2 border-muted">
                      <span className="text-xs text-muted-foreground w-6">{ci + 1}.</span>
                      <input className="flex-1 bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-1 py-0.5 text-sm"
                        value={ch.title}
                        onChange={e => updateGeneratedChapter(vi, ci, { title: e.target.value })} />
                      <input className="w-16 text-xs bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-1 py-0.5 text-right"
                        type="number" value={ch.targetWords}
                        onChange={e => updateGeneratedChapter(vi, ci, { targetWords: parseInt(e.target.value) || 3000 })} />
                      <input className="flex-1 bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-1 py-0.5 text-xs text-muted-foreground"
                        value={ch.summary}
                        onChange={e => updateGeneratedChapter(vi, ci, { summary: e.target.value })}
                        placeholder="摘要" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <Button variant="ghost" size="icon" className="size-7" onClick={() => handleRefineVolume(vol.id)} disabled={refiningVolume === vol.id} title="AI 细化本卷">
                  {refiningVolume === vol.id ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-primary" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete('volume', vol.id)}><Trash2 className="size-3.5 text-muted-foreground" /></Button>
              </div>
              {expandedVols.has(vol.id) && (
                <div className="divide-y">
                  {vol.chapters.map((ch, idx) => (
                    <ChapterRow key={ch.id} chapter={ch} isFirst={idx === 0} isLast={idx === vol.chapters.length - 1}
                      novelId={novelId}
                      onEdit={() => { setEditTarget({ type: 'chapter', id: ch.id }); setEditForm({ title: ch.title, summary: ch.summary || '', targetWords: ch.targetWords, status: ch.status }) }}
                      onDelete={() => handleDelete('chapter', ch.id)}
                      onMoveUp={() => handleMove(ch.id, 'up')} onMoveDown={() => handleMove(ch.id, 'down')}
                      onGenerateDetail={() => handleAIGenerateChapterDetail(ch)}
                      onExpandContent={() => handleAIExpandContent(ch)}
                      onExpand={() => { setExpandedChapter(ch.id); loadScenes(ch.id) }}
                      isExpanded={expandedChapter === ch.id}
                      scenes={expandedChapter === ch.id ? scenes : []}
                      scenesLoading={expandedChapter === ch.id ? scenesLoading : false}
                      onSaveScenes={() => handleSaveScenes(ch.id)}
                      onCloseDetail={() => { setExpandedChapter(null); setScenes([]) }}
                      onUpdateScene={(idx: number, patch: Partial<SceneData>) => {
                        const updated = [...scenes]
                        updated[idx] = { ...updated[idx], ...patch }
                        setScenes(updated)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {orphans.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b text-sm font-medium text-muted-foreground">未分类章节</div>
              <div className="divide-y">
                {orphans.map((ch, idx) => (
                  <ChapterRow key={ch.id} chapter={ch} isFirst={idx === 0} isLast={idx === orphans.length - 1}
                    novelId={novelId}
                    onEdit={() => { setEditTarget({ type: 'chapter', id: ch.id }); setEditForm({ title: ch.title, summary: ch.summary || '', targetWords: ch.targetWords, status: ch.status }) }}
                    onDelete={() => handleDelete('chapter', ch.id)}
                    onMoveUp={() => handleMove(ch.id, 'up')} onMoveDown={() => handleMove(ch.id, 'down')}
                    onGenerateDetail={() => handleAIGenerateChapterDetail(ch)}
                    onExpandContent={() => handleAIExpandContent(ch)}
                    onExpand={() => { setExpandedChapter(ch.id); loadScenes(ch.id) }}
                    isExpanded={expandedChapter === ch.id}
                    scenes={expandedChapter === ch.id ? scenes : []}
                    scenesLoading={expandedChapter === ch.id ? scenesLoading : false}
                    onSaveScenes={() => handleSaveScenes(ch.id)}
                    onCloseDetail={() => { setExpandedChapter(null); setScenes([]) }}
                    onUpdateScene={(idx: number, patch: Partial<SceneData>) => {
                      const updated = [...scenes]
                      updated[idx] = { ...updated[idx], ...patch }
                      setScenes(updated)
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Chapter Row ──────────────────────────────────

interface SceneData {
  id?: string; chapterId?: string; seq: number
  title: string; setting: string; characters: string
  conflict: string; outcome: string; emotionalBeat: string; notes: string
}

function ChapterRow({ chapter, isFirst, isLast, onEdit, onDelete, onMoveUp, onMoveDown, onGenerateDetail, onExpandContent, isExpanded, scenes, scenesLoading, onCloseDetail, onSaveScenes, onUpdateScene, onExpand, novelId }: {
  chapter: Chapter; isFirst: boolean; isLast: boolean
  onEdit: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
  onGenerateDetail: () => void; onExpandContent: () => void
  isExpanded: boolean; scenes: SceneData[]; scenesLoading: boolean; onCloseDetail: () => void
  onSaveScenes: () => void; onUpdateScene: (idx: number, patch: Partial<SceneData>) => void
  onExpand: () => void
  novelId: string
}) {
  const statusInfo = STATUS_MAP[chapter.status] ?? { label: chapter.status, color: 'bg-muted' }

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
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Link href={`/novel/${novelId}/write?chapterId=${chapter.id}`} className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-blue-600 no-underline" title="去写作">
            <PenLineIcon className="size-3" /> 写作
          </Link>
          <button className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-primary" onClick={onGenerateDetail} title="生成场景细纲">
            <Sparkles className="size-3" /> 细纲
          </button>
          <button className="p-1 hover:bg-accent rounded text-xs flex items-center gap-1 text-green-600" onClick={onExpandContent} title="展开章节内容（需先生成细纲）">
            <Expand className="size-3" /> 展开
            {chapter.wordCount > 0 && <span className="text-[9px] text-green-500 ml-0.5">✓</span>}
          </button>
          <button className="p-1 hover:bg-accent rounded" onClick={onEdit}><Pencil className="size-3 text-muted-foreground" /></button>
          <button className="p-1 hover:bg-accent rounded" onClick={onDelete}><Trash2 className="size-3 text-muted-foreground" /></button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 mx-4 mb-2 border-t">
          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-xs font-semibold flex items-center gap-1.5"><FileText className="size-3.5" /> 场景细纲</span>
            <div className="flex gap-1">
              {scenes.length > 0 && (
                <button onClick={onSaveScenes} className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90">
                  保存场景
                </button>
              )}
              <button onClick={onCloseDetail} className="p-0.5 hover:bg-accent rounded"><X className="size-3.5" /></button>
            </div>
          </div>

          {scenesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" /> 加载中...
            </div>
          ) : scenes.length > 0 ? (
            <div className="space-y-2">
              {scenes.map((s, i) => (
                <div key={i} className="rounded-lg border bg-card/50 p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">场景 {s.seq || i + 1}</span>
                    <input className="font-medium text-sm bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none flex-1 px-1"
                      value={s.title} onChange={e => onUpdateScene(i, { title: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">地点：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.setting} onChange={e => onUpdateScene(i, { setting: e.target.value })} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">角色：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.characters} onChange={e => onUpdateScene(i, { characters: e.target.value })} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">冲突：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.conflict} onChange={e => onUpdateScene(i, { conflict: e.target.value })} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">结果：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.outcome} onChange={e => onUpdateScene(i, { outcome: e.target.value })} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">情感：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.emotionalBeat} onChange={e => onUpdateScene(i, { emotionalBeat: e.target.value })} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">备注：</span>
                      <input className="bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none w-[calc(100%-3rem)]"
                        value={s.notes} onChange={e => onUpdateScene(i, { notes: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">点击「细纲」按钮生成场景</p>
          )}
        </div>
      )}
    </div>
  )
}