'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import {
  Plus, ChevronLeft, Loader2, Save, Check, Sparkles, Send,
  PanelLeft, PanelRight, PenLine, Wand2, Expand,
  Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered,
  Undo, Redo, Quote,
} from 'lucide-react'

interface Chapter {
  id: string; title: string; content: string; sortOrder: number
  status: string; wordCount: number; targetWords: number
  volumeId: string | null; volume: { title: string } | null
}

function WritePageInner() {
  const { id: novelId } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetChapterId = searchParams.get('chapterId')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [aiOperation, setAiOperation] = useState<'continue' | 'polish' | 'expand'>('continue')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [wordCount, setWordCount] = useState(0)
  // Selection toolbar position
  const [selToolbar, setSelToolbar] = useState<{ top: number; left: number } | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始创作，或选中文字使用 AI 润色/扩写...' }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText()
      setWordCount(text.replace(/\s/g, '').length)
      setSaved(false)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveContent(ed.getHTML()), 1500)
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      if (from !== to) {
        // Show floating toolbar near selection
        const coords = ed.view.coordsAtPos(from)
        setSelToolbar({ top: coords.top - 40, left: coords.left })
      } else {
        setSelToolbar(null)
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh] px-8 py-6 novel-editor',
      },
    },
  })

  // ─── Fetch chapters ────────────────────────────
  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setChapters(list); return list
    } catch (err) { console.error(err); return [] }
    finally { setLoading(false) }
  }, [novelId])

  const [pendingSelect, setPendingSelect] = useState<Chapter | null>(null)

  useEffect(() => {
    fetchChapters().then((list) => {
      if (list.length > 0 && !activeChapter) {
        const target = targetChapterId ? list.find((c: Chapter) => c.id === targetChapterId) : null
        setPendingSelect(target ?? list[0])
      }
    })
  }, [fetchChapters, targetChapterId])

  useEffect(() => {
    if (editor && pendingSelect) {
      editor.commands.setContent(pendingSelect.content || '')
      setActiveChapter(pendingSelect)
      setWordCount((pendingSelect.content || '').replace(/\s/g, '').length)
      setSaved(true); setPendingSelect(null)
    }
  }, [editor, pendingSelect])

  const selectChapter = useCallback((ch: Chapter) => {
    // Save current chapter before switching
    if (editor && activeChapter && !saved) {
      saveContent(editor.getHTML())
    }
    setActiveChapter(ch)
    if (editor) { editor.commands.setContent(ch.content || ''); setWordCount((ch.content || '').replace(/\s/g, '').length); setSaved(true) }
    else setPendingSelect(ch)
  }, [editor, activeChapter, saved])

  const createChapter = async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新章节', content: '', targetWords: 3000 }) })
      if (res.ok) { const created = await res.json(); const list = await fetchChapters(); selectChapter(list.find((c: Chapter) => c.id === created.id) || created) }
    } catch (err) { console.error(err) }
  }

  const saveContent = async (content: string) => {
    if (!activeChapter) return; setSaving(true)
    try { await fetch(`/api/novels/${novelId}/chapters/${activeChapter.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }); setSaved(true) }
    catch (err) { console.error(err) }
    finally { setSaving(false) }
  }
  const manualSave = () => { if (editor) saveContent(editor.getHTML()) }

  // ─── AI Operations ─────────────────────────────

  /** 将 AI 返回的文本转为编辑器可用的 HTML */
  const formatAIResponse = (text: string): string => {
    // 去除常见的 AI 前缀（"好的，以下是..."、"当然，..."等）
    let cleaned = text
      .replace(/^(好的[，,]?\s*|以下是.*?[：:]\s*|当然[，,]?\s*|明白了?[，,]?\s*)/i, '')
      // 去除末尾的总结语
      .replace(/\n*(希望这些[^\n]*|如果[^\n]*需要[^\n]*|请[^\n]*告诉[^\n]*)$/gi, '')
      .trim()

    // 如果已经是 HTML（含标签），直接返回
    if (/<[hp]/.test(cleaned)) return cleaned

    // 预处理：将 3+ 换行收敛为 2 换行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

    // 将纯文本转为 HTML 段落：按双换行分段
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        // 段落内单换行转 <br>（用于对话分行）
        const withBreaks = p.replace(/\n/g, '<br>')
        return `<p>${withBreaks}</p>`
      })

    return paragraphs.join('\n')
  }

  const callAI = async (operation: 'continue' | 'polish' | 'expand') => {
    if (!editor || !activeChapter) return
    setAiLoading(true); setShowAiPanel(true); setAiResponse(''); setAiOperation(operation)

    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to)

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId, chapterId: activeChapter.id, operation,
          cursorPosition: editor.state.selection.from,
          selectedText: selectedText || undefined,
          userInstruction: operation === 'polish' ? '更生动流畅' : undefined,
        }),
      })
      const data = await res.json()
      if (data.content) {
        setAiResponse(data.content)
        const formatted = formatAIResponse(data.content)

        if (operation === 'continue') {
          // 续写：在光标处插入，前置空行确保段落分隔
          const before = from > 0 ? '\n\n' : ''
          editor.chain().focus().insertContent(before + formatted).run()
        } else if (selectedText && (operation === 'polish' || operation === 'expand')) {
          // 润色/扩写：替换选中文字
          editor.chain().focus().setTextSelection({ from, to }).deleteSelection().insertContent(formatted).run()
        } else if (operation === 'polish' || operation === 'expand') {
          // 无选中时扩写/润色：在光标处插入
          editor.chain().focus().insertContent(formatted).run()
        }
        setSaved(false)
        // 触发保存
        setTimeout(() => { if (editor) saveContent(editor.getHTML()) }, 500)
      } else if (data.error) { setAiResponse(data.error) }
    } catch (err) { setAiResponse(String(err)) }
    finally { setAiLoading(false) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); manualSave() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  const targetWords = activeChapter?.targetWords ?? 3000
  const progressPct = Math.min(100, Math.round((wordCount / targetWords) * 100))

  const opLabels: Record<string, string> = {
    continue: 'AI 正在续写...',
    polish: 'AI 正在润色...',
    expand: 'AI 正在扩写...',
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="flex h-full">
      {/* Chapter Sidebar */}
      {showSidebar && (
        <aside className="w-56 border-r bg-sidebar shrink-0 flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-sm font-semibold">章节列表</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={createChapter}><Plus className="size-3.5" /></Button>
          </div>
          <div className="flex-1 overflow-auto divide-y">
            {chapters.map((ch) => (
              <button key={ch.id} onClick={() => selectChapter(ch)} className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 ${activeChapter?.id === ch.id ? 'bg-accent font-medium' : ''}`}>
                <div className="truncate">{ch.title || `第${ch.sortOrder}章`}</div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>{ch.wordCount} 字</span>
                  {ch.content && <span className="text-green-500">●</span>}
                </div>
              </button>
            ))}
            {chapters.length === 0 && <p className="text-xs text-muted-foreground text-center py-8 px-3">暂无章节</p>}
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push(`/novel/${novelId}`)}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowSidebar(!showSidebar)}><PanelLeft className="size-4" /></Button>

          {/* Formatting Toolbar */}
          <div className="flex items-center gap-0.5 border-x px-2 mx-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading1 className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="size-3.5" /></Button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-3.5" /></Button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().undo().run()}><Undo className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => editor?.chain().focus().redo().run()}><Redo className="size-3.5" /></Button>
          </div>

          <div className="flex-1" />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {saving ? <Loader2 className="size-3 animate-spin" /> : saved ? <Check className="size-3 text-green-500" /> : <span className="text-amber-500">●</span>}
            {saving ? '保存中' : saved ? '已保存' : '未保存'}
          </span>
          <Button variant="ghost" size="sm" onClick={manualSave} disabled={saved}><Save className="size-3.5" /></Button>
          <div className="w-px h-5 bg-border" />

          {/* AI Buttons */}
          <Button size="sm" onClick={() => callAI('continue')} disabled={aiLoading} className="gap-1.5">
            {aiLoading && aiOperation === 'continue' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            AI 续写
          </Button>
          <Button size="sm" variant="outline" onClick={() => callAI('expand')} disabled={aiLoading} className="gap-1.5">
            <Expand className="size-3.5" /> 扩写
          </Button>
          <Button size="sm" variant="outline" onClick={() => callAI('polish')} disabled={aiLoading} className="gap-1.5">
            <Wand2 className="size-3.5" /> 润色
          </Button>

          <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowAiPanel(!showAiPanel)}><PanelRight className="size-4" /></Button>
        </div>

        {/* Floating Selection Toolbar */}
        {selToolbar && !aiLoading && (
          <div
            className="absolute z-50 flex items-center gap-1 bg-popover border rounded-lg shadow-lg px-1.5 py-1 -translate-x-1/2"
            style={{ top: selToolbar.top, left: selToolbar.left }}
          >
            <button onClick={() => callAI('polish')} className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent">
              <Wand2 className="size-3" /> 润色选中
            </button>
            <button onClick={() => callAI('expand')} className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent">
              <Expand className="size-3" /> 扩写选中
            </button>
          </div>
        )}

        {/* Editor */}
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <PenLine className="size-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">还没有章节</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-2">请先在大纲页面创建章节结构</p>
            <Button onClick={() => router.push('/outline')} variant="outline" size="sm">去大纲页面</Button>
            <span className="text-xs text-muted-foreground mt-2">或</span>
            <Button onClick={createChapter} size="sm" className="mt-2"><Plus className="size-3.5" /> 快速创建章节</Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto"><EditorContent editor={editor} /></div>
        )}

        {/* Status Bar */}
        <div className="flex items-center gap-4 px-4 py-1.5 border-t text-xs text-muted-foreground bg-background shrink-0">
          <span>{wordCount.toLocaleString()} / {targetWords.toLocaleString()} 字</span>
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progressPct}%` }} /></div>
          <span className="flex-1" />
          {activeChapter && <span>{activeChapter.title}</span>}
        </div>
      </div>

      {/* AI Panel */}
      {showAiPanel && (
        <aside className="w-72 border-l bg-sidebar shrink-0 flex flex-col">
          <div className="p-3 border-b"><h3 className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="size-3.5" /> AI 助手</h3></div>
          <div className="flex-1 overflow-auto p-3">
            <div className="flex gap-1 mb-3">
              {(['continue', 'polish', 'expand'] as const).map((op) => (
                <button key={op} onClick={() => callAI(op)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${aiOperation === op ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>
                  {{ continue: '续写', polish: '润色', expand: '扩写' }[op]}
                </button>
              ))}
            </div>
            {aiLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2"><Loader2 className="size-4 animate-spin" />{opLabels[aiOperation] || 'AI 工作中...'}</div>}
            {aiResponse && <div className="text-xs whitespace-pre-wrap leading-relaxed bg-muted p-3 rounded-lg">{aiResponse}</div>}
            {!aiLoading && !aiResponse && (
              <div className="text-xs text-muted-foreground space-y-2">
                <p><strong>续写：</strong>从光标处继续写作，自动带入角色和世界观。</p>
                <p><strong>润色：</strong>选中文字后点击，AI 优化表达。</p>
                <p><strong>扩写：</strong>选中大纲点或简短描述，AI 展开为完整段落。</p>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full">加载中...</div>}>
      <WritePageInner />
    </Suspense>
  )
}
