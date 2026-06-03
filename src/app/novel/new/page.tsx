'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BookOpen, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'

interface Provider {
  id: string; name: string; models: string; baseUrl: string
}

export default function NewNovelPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    genre: '',
    perspective: 'third' as string,
    tense: 'past' as string,
    targetWords: 100000,
    styleProfile: '',
    defaultProviderId: '',
    defaultModel: '',
  })

  useEffect(() => {
    fetch('/api/settings/providers')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProviders(data)
          if (data.length > 0) {
            setForm(f => ({ ...f, defaultProviderId: data[0].id }))
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || null,
          description: form.description.trim() || null,
          genre: form.genre ? form.genre.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
          perspective: form.perspective,
          tense: form.tense,
          targetWords: form.targetWords,
          styleProfile: form.styleProfile.trim() || null,
          defaultProviderId: form.defaultProviderId || undefined,
          defaultModel: form.defaultModel || undefined,
        }),
      })
      if (res.ok) {
        const novel = await res.json()
        router.push(`/novel/${novel.id}/outline`)
      }
    } catch (err) {
      console.error('Create novel failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
        <BookOpen className="size-6" />
        新建小说
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        {step === 0 ? '填写基本信息，开始你的创作之旅' : '配置 AI 写作参数'}
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {['基础信息', 'AI 设置'].map((label, i) => (
          <button key={i} onClick={() => setStep(i)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              step === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium mb-1 block">书名 *</label>
            <input className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="输入书名..." value={form.title}
              onChange={e => update({ title: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">一句话简介</label>
            <input className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="简短介绍你的故事..." value={form.subtitle}
              onChange={e => update({ subtitle: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">详细简介</label>
            <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" rows={3}
              placeholder="更详细地描述你的故事背景和主线..." value={form.description}
              onChange={e => update({ description: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">类型标签（逗号分隔）</label>
            <input className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="玄幻, 修仙, 热血" value={form.genre}
              onChange={e => update({ genre: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">叙事视角</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.perspective} onChange={e => update({ perspective: e.target.value })}>
                <option value="third">第三人称</option>
                <option value="first">第一人称</option>
                <option value="omniscient">第三人称全知</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">时态</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.tense} onChange={e => update({ tense: e.target.value })}>
                <option value="past">过去时</option>
                <option value="present">现在时</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">目标总字数</label>
            <div className="flex gap-2">
              {[50000, 100000, 300000, 1000000].map(n => (
                <button key={n} onClick={() => update({ targetWords: n })}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    form.targetWords === n ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'
                  }`}>
                  {n >= 10000 ? `${n / 10000}万` : n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(1)} disabled={!form.title.trim()} className="gap-2">
              下一步 <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Provider Selection */}
          <div>
            <label className="text-sm font-medium mb-1 block">默认 AI 提供商</label>
            <p className="text-xs text-muted-foreground mb-1.5">选择用于写作和生成的 AI 服务</p>
            {providers.length === 0 ? (
              <p className="text-xs text-amber-600">暂未配置 AI 提供商，请先在「设置」页面添加</p>
            ) : (
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.defaultProviderId}
                onChange={e => {
                  update({ defaultProviderId: e.target.value, defaultModel: '' })
                }}>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.baseUrl})</option>
                ))}
              </select>
            )}
          </div>

          {/* Model Selection */}
          {form.defaultProviderId && (() => {
            const provider = providers.find(p => p.id === form.defaultProviderId)
            let models: string[] = []
            if (provider) {
              try { models = JSON.parse(provider.models) } catch { models = [] }
            }
            // Parse models array — could be strings or {id, name} objects
            const modelIds = models.map(m => typeof m === 'string' ? m : (m as {id?: string}).id || String(m))
            return (
              <div>
                <label className="text-sm font-medium mb-1 block">默认模型</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.defaultModel}
                  onChange={e => update({ defaultModel: e.target.value })}>
                  <option value="">自动选择</option>
                  {modelIds.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )
          })()}

          {/* Style Profile */}
          <div>
            <label className="text-sm font-medium mb-1 block">风格画像（可选）</label>
            <p className="text-xs text-muted-foreground mb-1.5">描述你期望的文风，或粘贴一段范文让 AI 学习</p>
            <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" rows={4}
              placeholder="例如：文风简洁有力，多用短句，对话犀利，场景描写细腻..." value={form.styleProfile}
              onChange={e => update({ styleProfile: e.target.value })} />
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
              <ArrowLeft className="size-4" /> 上一步
            </Button>
            <Button onClick={handleCreate} disabled={loading || !form.title.trim()} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <BookOpen className="size-4" />}
              创建小说
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
