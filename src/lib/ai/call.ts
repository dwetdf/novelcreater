/**
 * AI 调用器 — 共享的 AI API 调用逻辑
 * 
 * 从 generate/route.ts 抽取，供 OutlineGenerator、ContentExpander、
 * LanguagePolisher 等引擎类复用。
 */

import { prisma } from '@/lib/db/prisma'
import { recordAICall } from './stats'
import { createDecipheriv } from 'node:crypto'

// ─── 密钥解密 ────────────────────────────────────

const RAW_ENC_KEY = (process.env['ENCRYPTION_KEY'] || 'novelcreater-dev-key-32chars-xx')
const ENC_KEY = Buffer.alloc(32)
Buffer.from(RAW_ENC_KEY.slice(0, 32), 'utf8').copy(ENC_KEY)

function decryptApiKey(encoded: string): string {
  if (!encoded) return '' // Empty string
  try {
    const parts = encoded.split(':')
    if (parts.length !== 3) return encoded // Plaintext
    const [ivHex, tagHex, dataHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return encoded // Decryption failed → might be plaintext
  }
}

// ─── Provider 信息 ────────────────────────────────

export interface ProviderInfo {
  baseUrl: string
  apiKey: string
}

export interface ModelInfo {
  modelId: string
  provider: ProviderInfo | null
}

/** 获取当前活跃的 AI 提供商 */
export async function getActiveProvider(): Promise<{
  id: string; name: string; baseUrl: string; apiKey: string; models: string[]
} | null> {
  const row = await prisma.aIProvider.findFirst({
    where: { isActive: true },
  }) as { id: string; name: string; baseUrl: string; apiKey: string; models: string } | null

  if (!row) return null

  let models: string[] = []
  try { models = JSON.parse(row.models) } catch { models = row.models.split(',').map(s => s.trim()) }

  return { ...row, apiKey: decryptApiKey(row.apiKey), models }
}

/** 选择模型：请求指定的模型或默认第一个 */
export async function selectModel(requestedModel?: string): Promise<ModelInfo> {
  const provider = await getActiveProvider()

  if (!provider) {
    return { modelId: requestedModel ?? 'deepseek-v4-flash', provider: null }
  }

  const modelId = requestedModel && provider.models.includes(requestedModel)
    ? requestedModel
    : provider.models[0] ?? 'deepseek-v4-flash'

  return {
    modelId,
    provider: { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
  }
}

// ─── AI 调用 ──────────────────────────────────────

export interface AICallOptions {
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json' | 'text'
}

/**
 * 完整对话调用（system prompt + messages）
 */
export async function callAIChat(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts?: AICallOptions & { modelId?: string },
): Promise<string> {
  const startTime = Date.now()
  const { modelId: requestedModel, temperature = 0.8, maxTokens = 4000, responseFormat } = opts ?? {}
  const { modelId, provider } = await selectModel(requestedModel)

  if (!provider) {
    return `[未配置 AI 提供商] 请在设置页面配置 API Key。\n\n模型: ${modelId}`
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature,
    max_tokens: maxTokens,
  }

  if (responseFormat === 'json') {
    body['response_format'] = { type: 'json_object' }
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const latencyMs = Date.now() - startTime

  if (!response.ok) {
    const err = await response.text()
    recordAICall({ operation: 'chat', model: modelId, promptTokens: 0, completionTokens: 0, latencyMs, success: false })
    throw new Error(`AI API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const usage = data.usage
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0

  recordAICall({ operation: 'chat', model: modelId, promptTokens, completionTokens, latencyMs, success: true })

  return content
}

/**
 * 单 prompt 调用（适配 OutlineGenerator 的 callAI 接口）
 * 将 prompt 作为 user message，system message 为固定角色设定。
 */
export async function callAISingle(
  prompt: string,
  opts?: AICallOptions & { modelId?: string; systemPrompt?: string },
): Promise<string> {
  const systemPrompt = opts?.systemPrompt ?? '你是一位专业的小说写手和结构设计师。请严格按照要求输出，只输出结果不要加解释。'
  return callAIChat(systemPrompt, [{ role: 'user', content: prompt }], opts)
}

/**
 * 分离 system/user 的调用（适配 ContentExpander / LanguagePolisher）
 */
export async function callAISplit(
  systemPrompt: string,
  userMessage: string,
  opts?: AICallOptions & { modelId?: string },
): Promise<string> {
  return callAIChat(systemPrompt, [{ role: 'user', content: userMessage }], opts)
}

// ─── Token 估算 ──────────────────────────────────

export function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) tokens += 1.5
    else if (/[a-zA-Z]/.test(char)) tokens += 0.25
    else tokens += 0.5
  }
  return Math.ceil(tokens)
}
