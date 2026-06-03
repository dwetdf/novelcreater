/**
 * summarizer.ts — 章节摘要生成器
 * 
 * 盘活「前情回顾」—— 当前 summaryRepo.upsert 从未被调用，
 * WarmContextCollector.collectRecentSummaries 永远返回空。
 * 
 * 用 AI 生成三级摘要：
 * - oneLineSummary  ~30字
 * - briefSummary    ~150字
 * - detailedSummary ~500字
 * 
 * 写入 ChapterSummary 表，brief 摘要嵌入后存 briefEmbedding。
 */

import { prisma } from '@/lib/db/prisma'
import { summaryRepo } from './storage/summary-repo'
import { callAISingle } from '@/lib/ai/call'
import { getEmbeddingService } from './embedding/service'

// ─── 结果类型 ────────────────────────────────────

export interface SummarizeResult {
  chapterId: string
  status: 'skipped' | 'generated' | 'error'
  oneLineSummary?: string
  briefSummary?: string
  detailedSummary?: string
  error?: string
  latencyMs: number
}

// ─── 主入口 ──────────────────────────────────────

export async function summarizeChapter(
  novelId: string,
  chapterId: string,
): Promise<SummarizeResult> {
  const startTime = Date.now()

  try {
    // 1. 获取章节正文
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId, novelId },
      select: { content: true, title: true, summary: true },
    })

    if (!chapter?.content) {
      return { chapterId, status: 'skipped', latencyMs: Date.now() - startTime }
    }

    const plainText = chapter.content.replace(/<[^>]*>/g, '').trim()
    if (plainText.length < 100) {
      // 太短的内容不值得摘要
      return { chapterId, status: 'skipped', latencyMs: Date.now() - startTime }
    }

    // 2. 构建 prompt
    const prompt = `你是一位专业的小说编辑。请为以下章节生成三级摘要。

【章节标题】${chapter.title}
【章节正文（前1000字）】
${plainText.slice(0, 1000)}${plainText.length > 1000 ? '\n...(后续内容省略)' : ''}

请以 JSON 格式返回（只输出 JSON，不要加其他文字）：
{
  "oneLineSummary": "一句话概要，约30字",
  "briefSummary": "简要摘要，约150字",
  "detailedSummary": "详细摘要，约500字，包含关键情节转折"
}`

    // 3. 调用 AI
    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.3,  // 低温度，追求准确
      maxTokens: 1000,
    })

    // 4. 解析
    let parsed: { oneLineSummary?: string; briefSummary?: string; detailedSummary?: string } = {}
    try {
      const json = response.match(/\{[\s\S]*\}/)
      if (json) parsed = JSON.parse(json[0])
    } catch {
      return {
        chapterId, status: 'error',
        error: 'AI 返回格式无法解析',
        latencyMs: Date.now() - startTime,
      }
    }

    if (!parsed.oneLineSummary) {
      return {
        chapterId, status: 'error',
        error: 'AI 未返回有效摘要',
        latencyMs: Date.now() - startTime,
      }
    }

    // 5. 生成 brief 摘要的嵌入向量
    let briefEmbedding: Uint8Array | undefined
    try {
      const embeddingService = getEmbeddingService()
      const vec = await embeddingService.embedSingle(
        parsed.briefSummary || parsed.oneLineSummary,
      )
      briefEmbedding = new Uint8Array(new Float32Array(vec).buffer)
    } catch {
      // 嵌入失败不阻塞摘要写入
    }

    // 6. 写入 ChapterSummary
    await summaryRepo.upsert(chapterId, {
      oneLineSummary: parsed.oneLineSummary,
      briefSummary: parsed.briefSummary,
      detailedSummary: parsed.detailedSummary,
      ...(briefEmbedding ? { briefEmbedding } : {}),
    })

    return {
      chapterId,
      status: 'generated',
      oneLineSummary: parsed.oneLineSummary,
      briefSummary: parsed.briefSummary,
      detailedSummary: parsed.detailedSummary,
      latencyMs: Date.now() - startTime,
    }
  } catch (err) {
    console.error(`[Summarizer] Failed for chapter ${chapterId}:`, err)
    return {
      chapterId, status: 'error',
      error: String(err),
      latencyMs: Date.now() - startTime,
    }
  }
}
