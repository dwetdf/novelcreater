/**
 * 一致性校验 API
 * 
 * POST /api/novels/[id]/check
 * 
 * 检查最近 5 章 + 未回收伏笔的角色状态矛盾和视角漂移。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { callAISingle } from '@/lib/ai/call'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  try {
    // 1. 获取最近 5 章
    const recentChapters = await prisma.chapter.findMany({
      where: { novelId, content: { not: '' } },
      orderBy: { sortOrder: 'desc' },
      take: 5,
      select: { id: true, title: true, content: true, sortOrder: true },
    }) as Array<{ id: string; title: string; content: string; sortOrder: number }>

    if (recentChapters.length < 2) {
      return NextResponse.json({ message: '章节不足（需要至少2章）', issues: [] })
    }

    // 2. 获取未回收伏笔
    const unresolvedForeshadowings = await prisma.foreshadowing.findMany({
      where: { novelId, status: { in: ['planted', 'planned'] } },
      select: { content: true, plantChapter: { select: { title: true, sortOrder: true } } },
      orderBy: { createdAt: 'asc' },
    }) as Array<{ content: string; plantChapter: { title: string; sortOrder: number } }>

    // 3. 获取角色列表
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: { name: true, role: true },
    }) as Array<{ name: string; role: string | null }>

    // 4. 构建检查 prompt
    const chapterTexts = recentChapters
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((ch) => {
        const text = ch.content.replace(/<[^>]*>/g, '').trim().slice(0, 500)
        return `第${ch.sortOrder}章「${ch.title}」：${text}`
      })
      .join('\n\n---\n\n')

    const foreshadowText = unresolvedForeshadowings.length > 0
      ? unresolvedForeshadowings.map((f) =>
          `⚠️ 未回收伏笔（埋于第${f.plantChapter.sortOrder}章「${f.plantChapter.title}」）：${f.content}`
        ).join('\n')
      : '(无未回收伏笔)'

    const prompt = `你是一位小说审稿编辑。请检查以下内容的连贯性和一致性。

【角色列表】
${characters.map((c) => `- ${c.name}（${c.role ?? '角色'}）`).join('\n')}

【最近 5 章摘要】
${chapterTexts}

【未回收伏笔】
${foreshadowText}

请以 JSON 格式返回检查结果（只输出 JSON）：
{
  "issues": [
    {
      "type": "角色矛盾|伏笔超期|视角漂移|时间线矛盾|其他",
      "severity": "error|warning",
      "chapterRef": "第X章",
      "description": "问题描述"
    }
  ],
  "overall": "ok|has_issues"
}

只报告明确的问题，不要猜测。`

    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: 1500,
    })

    let parsed: { issues?: Array<Record<string, string>>; overall?: string } = {}
    try {
      const json = response.match(/\{[\s\S]*\}/)
      if (json) parsed = JSON.parse(json[0])
    } catch { /* use empty */ }

    return NextResponse.json({
      issues: parsed.issues || [],
      overall: parsed.overall || 'ok',
      chaptersChecked: recentChapters.length,
      unresolvedForeshadowings: unresolvedForeshadowings.length,
    })
  } catch (err) {
    console.error('[Check] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
