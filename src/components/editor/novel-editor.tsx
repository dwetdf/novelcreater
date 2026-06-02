'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, Heading2, Undo, Redo, Eye, EyeOff,
  Send, Sparkles, Loader2, PanelLeft, PanelRight,
} from 'lucide-react'

interface NovelEditorProps {
  novelId: string
  chapterId: string
  initialContent?: string
  chapterTitle?: string
}

export function NovelEditor({ novelId, chapterId, initialContent, chapterTitle }: NovelEditorProps) {
  const [focusMode, setFocusMode] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [wordCount, setWordCount] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写作，或使用 AI 辅助...',
      }),
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      const text = editor.getText()
      setWordCount(text.replace(/\s/g, '').length)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh] px-8 py-6',
      },
    },
  })

  // AI 续写
  const handleAIContinue = useCallback(async () => {
    if (!editor) return
    setAiLoading(true)
    setAiResponse(null)

    try {
      const content = editor.getHTML()
      const cursorPos = editor.state.selection.from

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chapterId,
          operation: 'continue',
          cursorPosition: cursorPos,
        }),
      })

      const data = await res.json()
      if (data.content) {
        setAiResponse(data.content)
        // 自动插入到光标处
        editor.chain().focus().insertContent(data.content).run()
      }
    } catch (err) {
      console.error('AI continue error:', err)
    } finally {
      setAiLoading(false)
    }
  }, [editor, novelId, chapterId])

  if (!editor) return null

  return (
    <div className={`flex h-full ${focusMode ? '' : ''}`}>
      {/* Editor Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${focusMode ? 'max-w-3xl mx-auto' : ''}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'bg-accent' : ''}
          >
            <Bold className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'bg-accent' : ''}
          >
            <Italic className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading') ? 'bg-accent' : ''}
          >
            <Heading2 className="size-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().undo().run()}>
            <Undo className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().redo().run()}>
            <Redo className="size-4" />
          </Button>

          <div className="flex-1" />

          {/* AI Continue Button */}
          <Button
            size="sm"
            onClick={handleAIContinue}
            disabled={aiLoading}
            className="gap-1.5"
          >
            {aiLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            AI 续写
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAiPanel(!showAiPanel)}
          >
            {showAiPanel ? <PanelRight className="size-4" /> : <PanelLeft className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFocusMode(!focusMode)}
          >
            {focusMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-auto">
          <EditorContent editor={editor} />
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-4 px-4 py-1.5 border-t text-xs text-muted-foreground bg-background shrink-0">
          <span>{wordCount.toLocaleString()} 字</span>
          {chapterTitle && <span>| {chapterTitle}</span>}
          <span className="flex-1" />
          <span>自动保存</span>
        </div>
      </div>

      {/* AI Sidebar Panel */}
      {showAiPanel && (
        <AIPanel
          novelId={novelId}
          chapterId={chapterId}
          editor={editor}
          loading={aiLoading}
        />
      )}
    </div>
  )
}

// ─── AI 侧边栏 ──────────────────────────────────

function AIPanel({
  novelId,
  chapterId,
  editor,
  loading,
}: {
  novelId: string
  chapterId: string
  editor: ReturnType<typeof useEditor>
  loading: boolean
}) {
  const [operation, setOperation] = useState<string>('continue')
  const [instruction, setInstruction] = useState('')
  const [contextPreview, setContextPreview] = useState<string | null>(null)

  const operations = [
    { id: 'continue', label: '续写', icon: Sparkles },
    { id: 'polish', label: '润色', icon: Sparkles },
    { id: 'expand', label: '扩写', icon: Sparkles },
    { id: 'brainstorm', label: '头脑风暴', icon: Sparkles },
  ]

  const handlePreview = async () => {
    if (!editor) return
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
    )

    const params = new URLSearchParams({
      novelId,
      chapterId,
      operation: 'continue',
      cursor: String(editor.state.selection.from),
    })
    if (selectedText) params.set('selectedText', selectedText)

    const res = await fetch(`/api/ai/generate?${params}`)
    const data = await res.json()
    setContextPreview(data.systemPrompt)
  }

  return (
    <aside className="w-72 border-l bg-sidebar shrink-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          AI 助手
        </h3>
      </div>

      {/* Operation Tabs */}
      <div className="p-2 flex gap-1 flex-wrap">
        {operations.map((op) => (
          <button
            key={op.id}
            onClick={() => setOperation(op.id)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              operation === op.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      {/* Instruction Input */}
      <div className="p-3 space-y-3 flex-1 overflow-auto">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            额外指令（可选）
          </label>
          <textarea
            className="w-full text-xs rounded-md border bg-background px-2.5 py-1.5 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="例如：让对话更紧张..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>

        {/* Context Preview */}
        <div>
          <button
            onClick={handlePreview}
            className="text-xs text-primary hover:underline mb-1"
          >
            查看上下文预览
          </button>
          {contextPreview && (
            <pre className="text-[10px] bg-muted p-2 rounded-md max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">
              {contextPreview.slice(0, 1500)}
              {contextPreview.length > 1500 && '\n\n... (截断)'}
            </pre>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="p-3 border-t">
        <Button className="w-full gap-1.5" size="sm" disabled={loading}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          发送
        </Button>
      </div>
    </aside>
  )
}
