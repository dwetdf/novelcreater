/**
 * AI 生成 API — 统一的 AI 调用入口
 * 
 * POST /api/ai/generate
 * Body: { novelId, chapterId, operation, cursorPosition?, selectedText?, userInstruction? }
 * 
 * 流程：ContextPipeline 组装上下文 → 调用 AI → 记录日志 → 返回结果
 */

import { NextResponse } from 'next/server'
import { getContextPipeline } from '@/lib/context/pipeline'

export const dynamic = 'force-dynamic'
import { aiLogger } from '@/lib/context/ai-logger'
import { prisma } from '@/lib/db/prisma'
import type { ContextRequest } from '@/lib/context/types'

export async function POST(req: Request) {
  const startTime = Date.now()
  
  try {
    const body = await req.json() as ContextRequest & { modelId?: string }

    if (!body.novelId || !body.operation) {
      return NextResponse.json(
        { error: '缺少必要参数：novelId, operation' },
        { status: 400 },
      )
    }

    // Brainstorm 可以不指定章节
    const chapterId = body.chapterId || 'brainstorm'

    // Step 1: 组装上下文
    const pipeline = getContextPipeline()
    const context = await pipeline.assemble({
      novelId: body.novelId,
      chapterId,
      operation: body.operation,
      cursorPosition: body.cursorPosition,
      selectedText: body.selectedText,
      userInstruction: body.userInstruction,
    })

    // Step 2: 选择模型 & 调用 AI
    const { modelId, provider } = await selectModel(body.modelId)
    const aiResponse = await callAI(context.systemPrompt, context.messages, modelId, provider)

    // Step 3: 记录日志
    await aiLogger.log({
      novelId: body.novelId,
      chapterId: body.chapterId,
      operation: body.operation,
      modelId,
      modelName: modelId,
      contextJson: JSON.stringify(context.debugInfo),
      promptText: context.systemPrompt,
      responseText: aiResponse,
      tokenUsage: {
        promptTokens: context.metadata.totalTokens,
        completionTokens: estimateTokens(aiResponse),
        totalTokens: context.metadata.totalTokens + estimateTokens(aiResponse),
      },
      latencyMs: Date.now() - startTime,
    })

    return NextResponse.json({
      content: aiResponse,
      metadata: context.metadata,
      latencyMs: Date.now() - startTime,
    })
  } catch (err) {
    console.error('[AI Generate] Error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    )
  }
}

/**
 * 上下文预览 API — 不调用 AI，仅返回组装的上下文
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const novelId = url.searchParams.get('novelId')
  const chapterId = url.searchParams.get('chapterId')
  const operation = url.searchParams.get('operation') as ContextRequest['operation']

  if (!novelId || !chapterId || !operation) {
    return NextResponse.json(
      { error: '缺少参数：novelId, chapterId, operation' },
      { status: 400 },
    )
  }

  const pipeline = getContextPipeline()
  const context = await pipeline.assemble({
    novelId,
    chapterId,
    operation,
    cursorPosition: parseInt(url.searchParams.get('cursor') ?? '0'),
    selectedText: url.searchParams.get('selectedText') ?? undefined,
    userInstruction: url.searchParams.get('instruction') ?? undefined,
  })

  return NextResponse.json({
    systemPrompt: context.systemPrompt,
    messages: context.messages,
    metadata: context.metadata,
    debugInfo: context.debugInfo,
  })
}

// ─── 模型选择 ───────────────────────────────────

async function selectModel(requestedModel?: string): Promise<{
  modelId: string
  provider: { baseUrl: string; apiKey: string } | null
}> {
  const provider = await prisma.aIProvider.findFirst({
    where: { isActive: true },
  }) as { baseUrl: string; apiKey: string; models: string } | null

  if (!provider) {
    return { modelId: requestedModel ?? 'deepseek-v4-flash', provider: null }
  }

  // 解析模型列表
  let models: string[] = []
  try { models = JSON.parse(provider.models) } catch { models = provider.models.split(',').map(s => s.trim()) }

  // 使用请求的模型，或默认第一个
  const modelId = requestedModel && models.includes(requestedModel)
    ? requestedModel
    : models[0] ?? 'deepseek-v4-flash'

  return { modelId, provider: { baseUrl: provider.baseUrl, apiKey: provider.apiKey } }
}

// ─── AI 调用 ─────────────────────────────────────

async function callAI(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  modelId: string,
  provider: { baseUrl: string; apiKey: string } | null,
): Promise<string> {
  if (!provider) {
    return `[未配置 AI 提供商] 请在设置页面配置 API Key。

模型: ${modelId}
系统提示词长度: ${systemPrompt.length} 字符`
  }

  // 实际 AI 调用
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.8,
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) tokens += 1.5
    else if (/[a-zA-Z]/.test(char)) tokens += 0.25
    else tokens += 0.5
  }
  return Math.ceil(tokens)
}
