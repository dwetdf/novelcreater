/**
 * 场景细纲生成 API — 接线 OutlineGenerator.generateSceneDetails
 * 
 * POST /api/novels/[id]/chapters/[chapterId]/scenes/generate
 * 
 * 注入本章摘要 + 角色档案 + 前一章结尾摘要作为上下文。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { OutlineGenerator } from '@/lib/context/outline-generator'
import { callAISingle } from '@/lib/ai/call'
import type { ChapterOutline } from '@/lib/context/outline-generator'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  try {
    // 1. 获取章节信息
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId, novelId },
      select: {
        id: true, title: true, summary: true, sortOrder: true,
        volume: { select: { title: true } },
      },
    }) as {
      id: string; title: string; summary: string | null; sortOrder: number
      volume: { title: string } | null
    } | null

    if (!chapter) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 })
    }

    // 2. 获取前一章摘要
    let prevChapterSummary = ''
    const prevChapter = await prisma.chapter.findFirst({
      where: { novelId, sortOrder: { lt: chapter.sortOrder } },
      orderBy: { sortOrder: 'desc' },
      select: { title: true, summary: true },
    })
    if (prevChapter) {
      prevChapterSummary = `前一章「${prevChapter.title}」：${prevChapter.summary || '(无摘要)'}`
    }

    // 3. 获取角色
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: { name: true, role: true, personality: true, catchphrase: true },
      take: 15,
    }) as { name: string; role: string | null; personality: string | null; catchphrase: string | null }[]

    // 4. 构建上下文
    const contextParts: string[] = []

    if (chapter.volume) {
      contextParts.push(`所属卷：${chapter.volume.title}`)
    }
    contextParts.push(`章节：${chapter.title}`)
    if (chapter.summary) {
      contextParts.push(`章节摘要：${chapter.summary}`)
    }

    if (prevChapterSummary) {
      contextParts.push(prevChapterSummary)
    }

    if (characters.length > 0) {
      contextParts.push('\n【出场角色档案】')
      characters.forEach(c => {
        const traits = c.personality ? c.personality.split(/[,，、]/).slice(0, 3).join('、') : ''
        const parts = [`  - ${c.name}（${c.role ?? '角色'}）`]
        if (traits) parts.push(`性格：${traits}`)
        if (c.catchphrase) parts.push(`口头禅：${c.catchphrase}`)
        contextParts.push(parts.join(' | '))
      })
    }

    const context = contextParts.join('\n')

    // 5. 构建 ChapterOutline 并调用 OutlineGenerator
    const chapterOutline: ChapterOutline = {
      title: chapter.title,
      summary: chapter.summary || '',
      keyEvents: [],
      characters: characters.map(c => c.name),
      targetWords: 3000,
    }

    const generator = new OutlineGenerator({
      callAI: (prompt: string) => callAISingle(prompt, {
        responseFormat: 'json',
        temperature: 0.7,
        maxTokens: 4000,
      }),
    })

    const scenes = await generator.generateSceneDetails(chapterOutline, context)

    return NextResponse.json({ scenes, context })
  } catch (err) {
    console.error('[Scenes Generate] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
