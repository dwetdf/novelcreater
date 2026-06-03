'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Globe, MapPin, Building2, ScrollText, Clock, Plus, Loader2, Trash2, Pencil, X } from 'lucide-react'

type Tab = 'locations' | 'factions' | 'rules' | 'timeline'

interface ItemBase { id: string; [key: string]: unknown }

export default function WorldPage() {
  const { id: novelId } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('locations')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ItemBase[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const endpoint = { locations: 'locations', factions: 'factions', rules: 'world-rules', timeline: 'timeline' }[tab]

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/novels/${novelId}/${endpoint}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setItems(await r.json())
    } catch (err) { console.error(`Fetch ${tab} failed:`, err) }
    finally { setLoading(false) }
  }, [novelId, endpoint, tab])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingId) {
        await fetch(`/api/novels/${novelId}/${endpoint}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: editingId, ...form }),
        })
      } else {
        await fetch(`/api/novels/${novelId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      setForm({}); setEditingId(null); setShowForm(false)
      fetchData()
    } catch (err) { console.error('Save failed:', err) }
    finally { setSaving(false) }
  }

  const handleEdit = (item: ItemBase) => {
    setEditingId(item.id)
    const f: Record<string, string> = {}
    for (const [k, v] of Object.entries(item)) {
      if (k !== 'id' && v != null) f[k] = String(v)
    }
    setForm(f)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/novels/${novelId}/${endpoint}?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'locations', label: '地点/场景', icon: MapPin },
    { id: 'factions', label: '势力/组织', icon: Building2 },
    { id: 'rules', label: '规则/设定', icon: ScrollText },
    { id: 'timeline', label: '时间线', icon: Clock },
  ]

  const tabFields: Record<Tab, { key: string; label: string; long?: boolean }[]> = {
    locations: [{ key: 'name', label: '名称 *' }, { key: 'type', label: '类型' }, { key: 'description', label: '描述', long: true }],
    factions: [{ key: 'name', label: '名称 *' }, { key: 'type', label: '类型' }, { key: 'leaderName', label: '首领' }, { key: 'goal', label: '目标' }, { key: 'description', label: '描述', long: true }],
    rules: [{ key: 'title', label: '标题 *' }, { key: 'category', label: '分类' }, { key: 'content', label: '内容', long: true }],
    timeline: [{ key: 'title', label: '事件 *' }, { key: 'eventTime', label: '时间' }, { key: 'description', label: '描述', long: true }],
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1">世界观</h1>
      <p className="text-sm text-muted-foreground mb-6">管理地点、势力、规则和时间线</p>

      <div className="flex gap-1 mb-4 border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setShowForm(false); setForm({}); setEditingId(null) }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="size-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Button size="sm" onClick={() => { setEditingId(null); setForm({}); setShowForm(!showForm) }}>
          <Plus className="size-3.5" /> 添加{tab === 'locations' ? '地点' : tab === 'factions' ? '势力' : tab === 'rules' ? '规则' : '事件'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 mb-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{editingId ? '编辑' : '新建'}</h3>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { setShowForm(false); setEditingId(null) }}><X className="size-3.5" /></Button>
          </div>
          {tabFields[tab].map((f) => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
              {f.long ? (
                <textarea className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={3}
                  value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : (
                <input className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null) }}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{editingId ? '更新' : '保存'}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 bg-card flex items-start gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{String(item[tab === 'rules' ? 'title' : 'name'] ?? '')}</span>
                  <span className="text-xs text-muted-foreground">{String(item[tab === 'timeline' ? 'eventTime' : 'type'] ?? '')}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(item[tab === 'factions' ? 'goal' : 'description'] ?? item['content'] ?? '')}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1 hover:bg-accent rounded" onClick={() => handleEdit(item)}><Pencil className="size-3.5 text-muted-foreground" /></button>
                <button className="p-1 hover:bg-accent rounded" onClick={() => handleDelete(item.id)}><Trash2 className="size-3.5 text-muted-foreground" /></button>
              </div>
            </div>
          ))}
          {!showForm && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">暂无数据</p>
          )}
        </div>
      )}
    </div>
  )
}
