/**
 * 章节展开 API — 接线 ContentExpander
 * 
 * POST /api/novels/[id]/chapters/[chapterId]/expand
 * 
 * 读 ChapterScene[]（P4 落库的场景细纲）→ 逐场景扩展 → 写入 Chapter.content。
 * 支持连续性检查和警告返回。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ContentExpander } from '@/lib/context/content-expander'
import { buildExpansionContext } from '@/lib/context/build-expansion-context'
import { callAISplit } from '@/lib/ai/call'
import type { SceneDetail } from '@/lib/context/outline-generator'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  try {
    const body = await req.json() as { targetWordsPerScene?: number }

    console.log('[Expand] Step 1: fetching chapter...')

    // 1. 获取章节信息
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId, novelId },
      select: { id: true, title: true, summary: true, targetWords: true },
    })

    if (!chapter) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 })
    }

    // 2. 获取场景细纲（ChapterScene）
    const sceneRows = await prisma.chapterScene.findMany({
      where: { chapterId, novelId },
      orderBy: { seq: 'asc' },
    }) as Array<{
      title: string; setting: string | null; characters: string | null
      conflict: string | null; outcome: string | null
      emotionalBeat: string | null; notes: string | null
    }>

    // 3. 转换为 SceneDetail[]
    let scenes: SceneDetail[] = sceneRows.map(s => ({
      title: s.title,
      setting: s.setting || '',
      characters: parseJsonArray(s.characters),
      conflict: s.conflict || '',
      outcome: s.outcome || '',
      emotionalBeat: s.emotionalBeat || '',
      notes: s.notes || '',
    }))

    // 4. 无场景降级：用 chapter.summary 做单次 expand
    if (scenes.length === 0 && chapter.summary) {
      scenes = [{
        title: chapter.title,
        setting: '',
        characters: [],
        conflict: '',
        outcome: '',
        emotionalBeat: '',
        notes: chapter.summary,
      }]
    }

    if (scenes.length === 0) {
      return NextResponse.json({ error: '没有场景细纲，请先生成细纲' }, { status: 400 })
    }

    // 5. 构建扩展上下文（角色/世界观/前情/伏笔）
    console.log('[Expand] Step 5: building expansion context...')
    let context: string
    try {
      context = await buildExpansionContext(novelId, chapterId)
      console.log('[Expand] Context built, length:', context.length)
    } catch (ctxErr) {
      console.error('[Expand] Context build failed:', ctxErr)
      context = ''
    }

    // 6. 获取小说视角
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { perspective: true },
    })

    // 7. 实例化 ContentExpander 并展开
    const targetWordsPerScene = body.targetWordsPerScene
      || Math.ceil((chapter.targetWords || 3000) / scenes.length)

    const expander = new ContentExpander({
      callAI: (systemPrompt: string, userMessage: string) =>
        callAISplit(systemPrompt, userMessage, {
          temperature: 0.8,
          maxTokens: Math.max(2000, targetWordsPerScene * 3),
        }),
    })

    const result = await expander.expandChapter(
      scenes,
      context,
      {
        targetWordsPerScene,
        perspective: novel?.perspective || 'third',
      },
    )

    // 8. 写入 Chapter.content（纯文本直接写，编辑器可后续用 HTML 包装）
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        content: result.content,
        wordCount: result.wordCount,
        status: 'draft',
      },
    })

    return NextResponse.json({
      content: result.content,
      wordCount: result.wordCount,
      scenesGenerated: result.scenesGenerated,
      totalScenes: scenes.length,
      warnings: result.warnings,
      contextUsed: context.length > 0,
    })
  } catch (err) {
    console.error('[Expand] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── 工具 ────────────────────────────────────────

function parseJsonArray(val: string | null): string[] {
  if (!val) return []
  // Already a plain string without JSON encoding
  if (!val.startsWith('[') && !val.startsWith('"') && !val.startsWith('{')) {
    return val.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed.map(String)
      : typeof parsed === 'string' ? [parsed]
      : []
  } catch {
    return val.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }
}
