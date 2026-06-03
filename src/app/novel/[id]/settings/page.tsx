'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Settings, Loader2, Save } from 'lucide-react'

interface NovelSettingsData {
  id: string
  contextWindowSize: number
  contextRetrievalScope: string
  contextTopK: number
  injectCharacters: string
  injectRecentSummary: boolean
  injectForeshadowing: boolean
  autoSnapshotInterval: number
  autoSaveInterval: number
  defaultModel: string | null
}

export default function NovelSettingsPage() {
  const { id: novelId } = useParams<{ id: string }>()
  const [settings, setSettings] = useState<NovelSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/novels/${novelId}`)
      .then(r => r.json())
      .then(data => {
        if (data.settings) setSettings(data.settings)
        else {
          // Create default settings if missing
          setSettings({
            id: '',
            contextWindowSize: 2000,
            contextRetrievalScope: 'volume',
            contextTopK: 5,
            injectCharacters: 'auto',
            injectRecentSummary: true,
            injectForeshadowing: true,
            autoSnapshotInterval: 0,
            autoSaveInterval: 30,
            defaultModel: null,
          })
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [novelId])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settings }),
      })
    } catch (err) { console.error('Save settings failed:', err) }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  if (!settings) return null

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
        <Settings className="size-6" />
        小说设置
      </h1>
      <p className="text-sm text-muted-foreground mb-8">调整 AI 上下文和写作辅助参数</p>

      <div className="space-y-6">
        {/* Context Window */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">前文窗口大小（字数）</label>
          <p className="text-xs text-muted-foreground mb-1.5">续写时向前取多少字的上下文</p>
          <input type="number" className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm"
            value={settings.contextWindowSize}
            onChange={e => setSettings({ ...settings, contextWindowSize: parseInt(e.target.value) || 2000 })} />
        </div>

        {/* Retrieval Scope */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">RAG 检索范围</label>
          <select className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm"
            value={settings.contextRetrievalScope}
            onChange={e => setSettings({ ...settings, contextRetrievalScope: e.target.value })}>
            <option value="chapter">当前章</option>
            <option value="volume">当前卷</option>
            <option value="novel">全书</option>
            <option value="smart">智能</option>
          </select>
        </div>

        {/* Top K */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">检索返回数量 (Top-K)</label>
          <input type="number" min={1} max={20} className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm"
            value={settings.contextTopK}
            onChange={e => setSettings({ ...settings, contextTopK: parseInt(e.target.value) || 5 })} />
        </div>

        {/* Character Injection */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">角色注入方式</label>
          <select className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm"
            value={settings.injectCharacters}
            onChange={e => setSettings({ ...settings, injectCharacters: e.target.value })}>
            <option value="auto">自动（匹配文中出现的角色）</option>
            <option value="manual">手动</option>
            <option value="off">关闭</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.injectRecentSummary}
              onChange={e => setSettings({ ...settings, injectRecentSummary: e.target.checked })}
              className="rounded" />
            <span className="text-sm">注入近章摘要（前情回顾）</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.injectForeshadowing}
              onChange={e => setSettings({ ...settings, injectForeshadowing: e.target.checked })}
              className="rounded" />
            <span className="text-sm">注入未回收伏笔提醒</span>
          </label>
        </div>

        {/* Auto Save */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">自动保存间隔（秒）</label>
          <input type="number" min={5} max={300} className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm"
            value={settings.autoSaveInterval}
            onChange={e => setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) || 30 })} />
        </div>

        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存设置
          </Button>
        </div>
      </div>
    </div>
  )
}
