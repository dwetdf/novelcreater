'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, Users, Loader2, ChevronDown, ChevronRight, Pencil, Trash2, X } from 'lucide-react'

interface Character {
  id: string; name: string; role: string | null; gender: string | null
  age: string | null; personality: string | null; appearance: string | null
  background: string | null; motivation: string | null; weakness: string | null
  catchphrase: string | null; abilities: string | null
}

const FIELD_LABELS: Record<string, string> = {
  name: '姓名 *', role: '角色定位', gender: '性别', age: '年龄',
  personality: '性格', catchphrase: '口头禅',
  appearance: '外貌', background: '背景', motivation: '动机',
  weakness: '弱点', abilities: '能力',
}
const SHORT_FIELDS = ['name', 'role', 'gender', 'age', 'personality', 'catchphrase']
const LONG_FIELDS = ['appearance', 'background', 'motivation', 'weakness', 'abilities']

const EMPTY_FORM: Record<string, string> = Object.fromEntries(
  [...SHORT_FIELDS, ...LONG_FIELDS].map((k) => [k, ''])
)

export default function CharactersPage() {
  const { id: novelId } = useParams<{ id: string }>()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [stateHistory, setStateHistory] = useState<Array<{id:string;state:string;location:string|null;alive:boolean;createdAt:string;chapter:{title:string;sortOrder:number}}>>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchCharacters = async () => {
    try {
      const r = await fetch(`/api/novels/${novelId}/characters`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setCharacters(await r.json())
    } catch (err) { console.error('Fetch characters failed:', err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCharacters() }, [novelId])

  const fetchStateHistory = async (charId: string) => {
    setLoadingHistory(true)
    try {
      const r = await fetch(`/api/novels/${novelId}/characters?history=${charId}`)
      if (r.ok) setStateHistory(await r.json())
    } catch { setStateHistory([]) }
    finally { setLoadingHistory(false) }
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await fetch(`/api/novels/${novelId}/characters`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ charId: editingId, ...form }),
        })
      } else {
        await fetch(`/api/novels/${novelId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      setForm({ ...EMPTY_FORM })
      setEditingId(null)
      setShowForm(false)
      fetchCharacters()
    } catch (err) { console.error('Save failed:', err) }
    finally { setSaving(false) }
  }

  const handleEdit = (char: Character) => {
    setEditingId(char.id)
    setForm({
      name: char.name || '',
      role: char.role || '', gender: char.gender || '', age: char.age || '',
      personality: char.personality || '', catchphrase: char.catchphrase || '',
      appearance: char.appearance || '', background: char.background || '',
      motivation: char.motivation || '', weakness: char.weakness || '',
      abilities: char.abilities || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/novels/${novelId}/characters?id=${id}`, { method: 'DELETE' })
    fetchCharacters()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">角色管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理小说角色档案</p>
        </div>
        <Button size="sm" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); setShowForm(!showForm) }}>
          <Plus className="size-3.5" /> 添加角色
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border p-4 mb-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{editingId ? '编辑角色' : '新建角色'}</h3>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleCancel}><X className="size-3.5" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SHORT_FIELDS.map((key) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{FIELD_LABELS[key]}</label>
                <input className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          {LONG_FIELDS.map((key) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground mb-1 block">{FIELD_LABELS[key]}</label>
              <textarea className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={2}
                value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {editingId ? '更新' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* Character List */}
      <div className="space-y-2">
        {characters.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-8">还没有角色，点击"添加角色"创建</p>
        )}
        {characters.map((char) => (
          <div key={char.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg cursor-pointer"
              role="button" tabIndex={0}
              onClick={() => { setExpanded(expanded === char.id ? null : char.id); if (expanded !== char.id) fetchStateHistory(char.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setExpanded(expanded === char.id ? null : char.id); if (expanded !== char.id) fetchStateHistory(char.id) } }}>
              {expanded === char.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className="font-medium">{char.name}</span>
              {char.role && <span className="text-xs text-muted-foreground">{char.role}</span>}
              {char.gender && <span className="text-xs text-muted-foreground">{char.gender}</span>}
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="shrink-0"
                onClick={(e) => { e.stopPropagation(); handleEdit(char) }}>
                <Pencil className="size-3.5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0"
                onClick={(e) => { e.stopPropagation(); handleDelete(char.id) }}>
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            {expanded === char.id && (
              <div className="px-4 pb-4 pt-0 border-t mx-4 space-y-2 text-sm">
                {(['personality', 'appearance', 'background', 'motivation', 'weakness', 'catchphrase', 'abilities'] as (keyof Character)[]).map((k) => {
                  const v = char[k]
                  if (!v) return null
                  return <div key={k}><span className="text-muted-foreground">{(FIELD_LABELS[k] || k).replace(' *', '')}：</span>{String(v)}</div>
                })}
                {/* State History Timeline */}
                <div className="pt-2 mt-2 border-t">
                  <span className="text-xs font-medium text-muted-foreground">📋 状态时间线</span>
                  {loadingHistory ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="size-3 animate-spin" /> 加载中...
                    </div>
                  ) : stateHistory.length > 0 ? (
                    <div className="space-y-1.5 mt-1 max-h-48 overflow-auto">
                      {stateHistory.map((s) => (
                        <div key={s.id} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 size-1.5 rounded-full shrink-0 ${s.alive ? 'bg-green-400' : 'bg-red-400'}`} />
                          <div>
                            <span className="text-muted-foreground">第{s.chapter.sortOrder}章「{s.chapter.title}」</span>
                            <span className="ml-1">{s.state}</span>
                            {s.location && <span className="text-muted-foreground ml-1">📍{s.location}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">暂无状态记录。展开章节后 AI 会自动记录角色状态。</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
