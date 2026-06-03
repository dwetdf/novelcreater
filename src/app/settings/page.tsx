'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Loader2, Cpu, Key, Globe, Zap } from 'lucide-react'

interface AIProvider {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  models: string
  isActive: boolean
}

// ─── 预设配置 ────────────────────────────────────

const DEEPSEEK_DEFAULTS = {
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  models: 'deepseek-v4-flash, deepseek-v4-pro',
}

const SILICONFLOW_DEFAULTS = {
  name: '硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  models: 'Qwen/Qwen3-8B, Qwen/Qwen2.5-7B-Instruct',
  embeddingModel: 'BAAI/bge-large-zh-v1.5',
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    models: '',
  })
  const [saving, setSaving] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [sfSetupLoading, setSfSetupLoading] = useState(false)

  // Embedding config state
  const [embeddingProviderId, setEmbeddingProviderId] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/providers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setProviders(await res.json())
    } catch (err) {
      console.error('Fetch providers failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProviders() }, [fetchProviders])

  // ─── 一键配置硅基流动 ──────────────────────────

  const handleSetupSiliconFlow = async () => {
    setSfSetupLoading(true)
    try {
      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: SILICONFLOW_DEFAULTS.name,
          apiKey: '',
          baseUrl: SILICONFLOW_DEFAULTS.baseUrl,
          models: SILICONFLOW_DEFAULTS.models.split(',').map((s) => s.trim()),
        }),
      })
      if (res.ok) {
        const created = await res.json()
        // Auto-save as embedding provider
        setEmbeddingProviderId(created.id)
        setEmbeddingModel(SILICONFLOW_DEFAULTS.embeddingModel)
        await fetchProviders()
        // Save to NovelSettings
        await handleSaveEmbeddingConfigDirect(created.id, SILICONFLOW_DEFAULTS.embeddingModel)
      }
    } catch (err) { console.error('Setup SiliconFlow failed:', err) }
    finally { setSfSetupLoading(false) }
  }

  // ─── 保存嵌入配置（直接参数版）──────────────────

  const handleSaveEmbeddingConfigDirect = async (providerId: string, model: string) => {
    try {
      const novelsRes = await fetch('/api/novels')
      const novels = await novelsRes.json()
      if (Array.isArray(novels)) {
        for (const n of novels) {
          await fetch(`/api/novels/${n.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: { embeddingProviderId: providerId, embeddingModel: model } }),
          })
        }
      }
    } catch (err) { console.error('Save embedding config failed:', err) }
  }

  // ─── 保存嵌入配置 ───────────────────────────────

  const handleSaveEmbeddingConfig = async () => {
    try {
      // Save to the first novel's settings (global embedding config)
      const novelsRes = await fetch('/api/novels')
      const novels = await novelsRes.json()
      if (Array.isArray(novels) && novels.length > 0) {
        for (const n of novels) {
          await fetch(`/api/novels/${n.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              settings: { embeddingProviderId: embeddingProviderId || null, embeddingModel: embeddingModel || null },
            }),
          })
        }
      }
    } catch (err) { console.error('Save embedding config failed:', err) }
  }

  // ─── 一键配置 DeepSeek ──────────────────────────

  const handleSetupDeepSeek = async () => {
    setSetupLoading(true)
    try {
      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: DEEPSEEK_DEFAULTS.name,
          apiKey: '',  // 用户稍后填入
          baseUrl: DEEPSEEK_DEFAULTS.baseUrl,
          models: DEEPSEEK_DEFAULTS.models.split(',').map((s) => s.trim()),
        }),
      })
      if (res.ok) {
        await fetchProviders()
      }
    } catch (err) {
      console.error('Setup DeepSeek failed:', err)
    } finally {
      setSetupLoading(false)
    }
  }

  // ─── 保存提供商 ─────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim() || !form.apiKey.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          apiKey: form.apiKey.trim(),
          baseUrl: form.baseUrl.trim(),
          models: form.models.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (res.ok) {
        setForm({ name: '', apiKey: '', baseUrl: 'https://api.openai.com/v1', models: '' })
        fetchProviders()
      }
    } catch (err) {
      console.error('Save provider failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // ─── 删除 ───────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/settings/providers?id=${id}`, { method: 'DELETE' })
      fetchProviders()
    } catch (err) {
      console.error('Delete provider failed:', err)
    }
  }

  // ─── 切换启停 ───────────────────────────────────

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await fetch('/api/settings/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !current }),
      })
      fetchProviders()
    } catch (err) {
      console.error('Toggle failed:', err)
    }
  }

  // ─── 更新 API Key ──────────────────────────────

  const handleUpdateKey = async (id: string, apiKey: string) => {
    if (!apiKey.trim()) return
    try {
      await fetch('/api/settings/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, apiKey: apiKey.trim() }),
      })
      fetchProviders()
    } catch (err) {
      console.error('Update key failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const deepseekProvider = providers.find((p) => p.name === 'DeepSeek')
  const otherProviders = providers.filter((p) => p.name !== 'DeepSeek')

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-2">设置</h1>
      <p className="text-sm text-muted-foreground mb-8">管理 AI 提供商和应用配置</p>

      {/* ─── DeepSeek 专区 ───────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="size-5 text-amber-500" />
          默认提供商：DeepSeek
        </h2>

        {!deepseekProvider ? (
          <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5">
            <p className="text-sm mb-3">
              DeepSeek 性价比极高，中英文写作能力强。点击下方按钮自动配置。
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
              <code className="bg-muted px-2 py-0.5 rounded">Base URL: {DEEPSEEK_DEFAULTS.baseUrl}</code>
              <code className="bg-muted px-2 py-0.5 rounded">模型: {DEEPSEEK_DEFAULTS.models}</code>
            </div>
            <Button onClick={handleSetupDeepSeek} disabled={setupLoading} size="sm" className="gap-1.5">
              {setupLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              一键配置 DeepSeek
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{deepseekProvider.name}</span>
                <button
                  onClick={() => handleToggleActive(deepseekProvider.id, deepseekProvider.isActive)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                    deepseekProvider.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {deepseekProvider.isActive ? '已启用' : '已停用'}
                </button>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(deepseekProvider.id)}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">Base URL</label>
                <p className="font-mono text-xs mt-0.5">{deepseekProvider.baseUrl}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">模型</label>
                <p className="text-xs mt-0.5">{safeParseModels(deepseekProvider.models).join(', ')}</p>
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                API Key {deepseekProvider.apiKey && deepseekProvider.apiKey !== '****' ? '✅ 已配置' : '⚠️ 未配置'}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={deepseekProvider.apiKey ? '••••••••' : '输入你的 DeepSeek API Key'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateKey(deepseekProvider.id, (e.target as HTMLInputElement).value)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement
                    handleUpdateKey(deepseekProvider.id, input.value)
                    input.value = ''
                  }}
                >
                  保存
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                获取 Key: https://platform.deepseek.com → API Keys
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ─── 硅基流动 专区 ───────────────────────── */}
      {(() => {
        const sfProvider = providers.find((p) => p.name === '硅基流动')
        return (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="size-5 text-purple-500" />
              向量嵌入：硅基流动
            </h2>
            {!sfProvider ? (
              <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-5">
                <p className="text-sm mb-3">硅基流动提供免费额度的中文嵌入 API，适合 RAG 向量检索。</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <code className="bg-muted px-2 py-0.5 rounded">{SILICONFLOW_DEFAULTS.baseUrl}</code>
                  <code className="bg-muted px-2 py-0.5 rounded">嵌入: {SILICONFLOW_DEFAULTS.embeddingModel}</code>
                </div>
                <Button onClick={handleSetupSiliconFlow} disabled={sfSetupLoading} size="sm" variant="outline" className="gap-1.5">
                  {sfSetupLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  一键配置硅基流动
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{sfProvider.name}</span>
                    <button onClick={() => handleToggleActive(sfProvider.id, sfProvider.isActive)}
                      className={`text-xs px-2 py-0.5 rounded-full ${sfProvider.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
                      {sfProvider.isActive ? '已启用' : '已停用'}
                    </button>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(sfProvider.id)}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><label className="text-xs text-muted-foreground">Base URL</label><p className="font-mono text-xs mt-0.5">{sfProvider.baseUrl}</p></div>
                  <div><label className="text-xs text-muted-foreground">模型</label><p className="text-xs mt-0.5">{safeParseModels(sfProvider.models).join(', ')}</p></div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    API Key {sfProvider.apiKey && sfProvider.apiKey !== '****' ? '✅ 已配置' : '⚠️ 未配置'}
                  </label>
                  <div className="flex gap-2">
                    <input type="password"
                      className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={sfProvider.apiKey ? '••••••••' : '输入硅基流动 API Key'}
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleUpdateKey(sfProvider.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }} />
                    <Button size="sm" variant="outline" onClick={(e) => {
                      const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement
                      handleUpdateKey(sfProvider.id, input.value); input.value = ''
                    }}>保存</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">获取 Key: https://siliconflow.cn → API Keys</p>
                </div>
                {/* Embedding model config */}
                <div className="pt-3 border-t">
                  <label className="text-xs text-muted-foreground mb-1 block">嵌入模型名（用于 RAG 向量检索）</label>
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm"
                      value={embeddingModel || SILICONFLOW_DEFAULTS.embeddingModel}
                      onChange={e => setEmbeddingModel(e.target.value)}
                      placeholder={SILICONFLOW_DEFAULTS.embeddingModel} />
                    <Button size="sm" onClick={handleSaveEmbeddingConfig} className="gap-1.5">保存</Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )
      })()}



      {/* ─── 其他提供商 ───────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Cpu className="size-5" />
          其他提供商
        </h2>

        <div className="space-y-3 mb-4">
          {otherProviders.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">暂无其他提供商</p>
          )}
          {otherProviders.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <button
                    onClick={() => handleToggleActive(p.id, p.isActive)}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      p.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.isActive ? '启用' : '停用'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">{p.baseUrl}</p>
                <p className="text-xs text-muted-foreground">模型: {safeParseModels(p.models).join(', ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add Form */}
        <div className="rounded-lg border p-4 space-y-3 bg-card">
          <h3 className="text-sm font-medium">添加提供商</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">名称</label>
              <input
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="OpenAI / Anthropic"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Base URL</label>
              <input
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="https://api.openai.com/v1"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
              <input
                type="password"
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">模型列表（逗号分隔）</label>
              <input
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="gpt-4o, gpt-4o-mini"
                value={form.models}
                onChange={(e) => setForm({ ...form, models: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name || !form.apiKey}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              添加
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Config Reference */}
      <section className="rounded-lg border p-5 bg-card">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="size-4" />
          快速配置参考
        </h2>
        <div className="space-y-2 text-sm">
          {[
            ['DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-v4-flash, deepseek-v4-pro', 'https://platform.deepseek.com'],
            ['OpenAI', 'https://api.openai.com/v1', 'gpt-4o, gpt-4o-mini', 'https://platform.openai.com'],
            ['Anthropic', 'https://api.anthropic.com/v1', 'claude-3.5-sonnet', 'https://console.anthropic.com'],
            ['Ollama (本地)', 'http://localhost:11434/v1', 'qwen2.5, llama3', 'https://ollama.com'],
          ].map(([name, url, models, link]) => (
            <div key={name} className="flex items-start gap-2 text-xs">
              <span className="font-medium shrink-0 w-20">{name}:</span>
              <span className="text-muted-foreground">
                URL: <code className="bg-muted px-1 rounded">{url}</code> | 模型: {models}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function safeParseModels(models: string): string[] {
  try {
    const parsed = JSON.parse(models)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch { /* ignore */ }
  return models.split(',').map((s) => s.trim()).filter(Boolean)
}
