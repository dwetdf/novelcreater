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
import { selectModel, callAIChat, estimateTokens } from '@/lib/ai/call'

export const dynamic = 'force-dynamic'
import { aiLogger } from '@/lib/context/ai-logger'
import type { ContextRequest } from '@/lib/context/types'

export async function POST(req: Request) {
  const startTime = Date.now()
  
  try {
    const body = await req.json() as ContextRequest & { modelId?: string; stream?: boolean }

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

    // Step 2: 选择模型
    const { modelId, provider } = await selectModel(body.modelId)

    // ─── 流式输出 (SSE) ─────────────────────────

    if (body.stream && provider) {
      const stream = await streamAIResponse(
        provider.baseUrl,
        provider.apiKey,
        modelId,
        context.systemPrompt,
        context.messages.map(m => ({ role: m.role, content: m.content })),
      )

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // Step 3: 非流式 — 调用 AI
    const aiResponse = await callAIChat(
      context.systemPrompt,
      context.messages.map(m => ({ role: m.role, content: m.content })),
      { modelId, temperature: 0.8, maxTokens: 4000 },
    )

    // Step 4: 记录日志
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

// ─── 流式 AI 调用 ────────────────────────────────

async function streamAIResponse(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<ReadableStream> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens: 4000,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API stream error: ${response.status} ${err}`)
  }

  // 将 OpenAI SSE 流转换为我们的 SSE 格式
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
        controller.close()
        return
      }

      const chunk = decoder.decode(value, { stream: true })
      // OpenAI SSE lines: "data: {...}\n\n"
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
            controller.close()
            return
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: {"type":"token","content":${JSON.stringify(content)}}\n\n`))
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    },
  })
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


