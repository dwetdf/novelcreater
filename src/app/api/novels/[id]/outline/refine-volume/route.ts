/**
 * 单卷细化 API — AI 细化单个卷的章列表
 * 
 * POST /api/novels/[id]/outline/refine-volume
 * Body: { volumeId, instruction? }
 * 
 * 基于卷概要 + 前后卷上下文 + 已有角色/世界观，生成/补全章节列表。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { callAISingle, getActiveProvider } from '@/lib/ai/call'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  try {
    const body = await req.json() as { volumeId?: string; instruction?: string }
    if (!body.volumeId) {
      return NextResponse.json({ error: '缺少 volumeId' }, { status: 400 })
    }

    // 1. 获取卷信息
    const volume = await prisma.volume.findUnique({
      where: { id: body.volumeId, novelId },
      select: { id: true, title: true, summary: true, sortOrder: true },
    }) as { id: string; title: string; summary: string | null; sortOrder: number } | null

    if (!volume) {
      return NextResponse.json({ error: '卷不存在' }, { status: 404 })
    }

    // 2. 获取当前卷已有的章节
    const existingChapters = await prisma.chapter.findMany({
      where: { volumeId: body.volumeId, novelId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, summary: true, sortOrder: true },
    }) as { id: string; title: string; summary: string | null; sortOrder: number }[]

    // 3. 获取前后卷上下文
    const allVolumes = await prisma.volume.findMany({
      where: { novelId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, summary: true, sortOrder: true },
    }) as { id: string; title: string; summary: string | null; sortOrder: number }[]

    const prevVol = allVolumes.find(v => v.sortOrder === volume.sortOrder - 1)
    const nextVol = allVolumes.find(v => v.sortOrder === volume.sortOrder + 1)

    // 4. 获取角色和世界观（全量注入，保证连贯）
    const [characters, factions, worldRules] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true, personality: true },
        take: 20,
      }) as Promise<{ name: string; role: string | null; personality: string | null }[]>,
      prisma.faction.findMany({
        where: { novelId },
        select: { name: true, type: true, goal: true },
        take: 10,
      }) as Promise<{ name: string; type: string | null; goal: string | null }[]>,
      prisma.worldRule.findMany({
        where: { novelId },
        select: { title: true, category: true, content: true },
        take: 15,
      }) as Promise<{ title: string; category: string | null; content: string }[]>,
    ])

    // 5. 构建上下文 prompt
    const contextParts: string[] = []

    contextParts.push(`【当前卷】`)
    contextParts.push(`卷名：${volume.title}`)
    if (volume.summary) contextParts.push(`概要：${volume.summary}`)
    if (existingChapters.length > 0) {
      contextParts.push(`已有章节（${existingChapters.length} 章）：`)
      existingChapters.forEach(ch => {
        contextParts.push(`  - ${ch.title}${ch.summary ? `：${ch.summary}` : ''}`)
      })
    }

    if (prevVol) {
      contextParts.push(`\n【前一卷】${prevVol.title}${prevVol.summary ? `：${prevVol.summary}` : ''}`)
    }
    if (nextVol) {
      contextParts.push(`\n【后一卷】${nextVol.title}${nextVol.summary ? `：${nextVol.summary}` : ''}`)
    }

    if (characters.length > 0) {
      contextParts.push(`\n【已有角色】`)
      characters.forEach(c => {
        const traits = c.personality ? c.personality.split(/[,，、]/).slice(0, 3).join('、') : ''
        contextParts.push(`  - ${c.name}（${c.role ?? '角色'}）${traits ? `| ${traits}` : ''}`)
      })
    }

    if (factions.length > 0) {
      contextParts.push(`\n【势力/组织】`)
      factions.forEach(f => {
        contextParts.push(`  - ${f.name}${f.type ? `（${f.type}）` : ''}${f.goal ? ` | 目标：${f.goal}` : ''}`)
      })
    }

    if (worldRules.length > 0) {
      contextParts.push(`\n【世界观规则】`)
      worldRules.forEach(r => {
        contextParts.push(`  - [${r.category ?? '设定'}] ${r.title}：${r.content.slice(0, 80)}`)
      })
    }

    const instruction = body.instruction || '请分析以上上下文，为本卷生成/优化章节列表。确保章与章之间有清晰的情节推进，与前后卷衔接自然。'

    const prompt = `${contextParts.join('\n')}

---

${instruction}

请以 JSON 格式返回，只输出 JSON 不要加其他文字：
{
  "volumeSummary": "优化后的卷概要（一句话）",
  "chapters": [
    { "title": "章节标题", "summary": "1-2句章节摘要" }
  ]
}`

    // 6. 调用 AI
    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.7,
      maxTokens: 4000,
    })

    // 7. 解析响应
    let parsed: { volumeSummary?: string; chapters?: { title: string; summary?: string }[] } = {}
    try {
      const json = response.match(/\{[\s\S]*\}/)
      if (json) parsed = JSON.parse(json[0])
    } catch {
      return NextResponse.json({
        error: 'AI 返回格式无法解析',
        raw: response.slice(0, 500),
      }, { status: 422 })
    }

    return NextResponse.json({
      volumeSummary: parsed.volumeSummary || volume.summary,
      existingChapters: existingChapters.map(ch => ({ id: ch.id, title: ch.title, summary: ch.summary })),
      suggestedChapters: parsed.chapters || [],
    })
  } catch (err) {
    console.error('[Refine Volume] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
