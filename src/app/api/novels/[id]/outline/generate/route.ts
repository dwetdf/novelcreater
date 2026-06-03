/**
 * 大纲生成 API — 接线 OutlineGenerator
 * 
 * POST /api/novels/[id]/outline/generate
 * Body: { theme, genre?, targetLength? }
 * 
 * 返回卷章结构供前端预览，不直接落库。
 * 用户确认后调用 commit 接口批量写入。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { OutlineGenerator } from '@/lib/context/outline-generator'
import { callAISingle } from '@/lib/ai/call'
import type { OutlineGenRequest } from '@/lib/context/types'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  try {
    const body = await req.json() as { theme?: string; genre?: string; targetLength?: number; volumeCount?: number; chapterCount?: number }

    if (!body.theme?.trim()) {
      return NextResponse.json(
        { error: '缺少必要参数：theme' },
        { status: 400 },
      )
    }

    // ─── 获取已有角色和世界观（如果已创建）─────────
    const [characters, factions, worldRules] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true, personality: true, motivation: true },
        take: 20,
      }),
      prisma.faction.findMany({
        where: { novelId },
        select: { name: true, type: true, goal: true },
        take: 10,
      }),
      prisma.worldRule.findMany({
        where: { novelId },
        select: { title: true, category: true, content: true },
        take: 15,
      }),
    ]) as [
      { name: string; role: string | null; personality: string | null; motivation: string | null }[],
      { name: string; type: string | null; goal: string | null }[],
      { title: string; category: string | null; content: string }[],
    ]

    // 构建上下文注入
    const contextParts: string[] = []
    if (characters.length > 0) {
      contextParts.push('【已创建的角色（必须融入大纲）】')
      characters.forEach(c => {
        const traits = c.personality ? ` | ${c.personality.split(/[,，、]/).slice(0,3).join('、')}` : ''
        contextParts.push(`  ${c.name}（${c.role ?? '角色'}）${traits}`)
      })
    }
    if (factions.length > 0) {
      contextParts.push('【已创建的势力/组织】')
      factions.forEach(f => {
        contextParts.push(`  ${f.name}${f.type ? `（${f.type}）` : ''}${f.goal ? ` → ${f.goal}` : ''}`)
      })
    }
    if (worldRules.length > 0) {
      contextParts.push('【已设定的世界观规则（必须遵循）】')
      worldRules.forEach(r => {
        contextParts.push(`  [${r.category ?? '设定'}] ${r.title}：${r.content.slice(0, 100)}`)
      })
    }
    const extraContext = contextParts.length > 0
      ? '\n\n' + contextParts.join('\n') + '\n\n请确保大纲充分利用上述角色和世界观设定。'
      : ''

    // 实例化 OutlineGenerator，注入共享 AI 调用器
    const generator = new OutlineGenerator({
      callAI: (prompt: string) => callAISingle(prompt + extraContext, {
        responseFormat: 'json',
        temperature: 0.7,
        maxTokens: 8000,
      }),
    })

    // 将卷/章数量注入到 theme 中（OutlineGenerator 的 prompt 模板不直接支持这些参数）
    const volumeCount = body.volumeCount || 4
    const chapterCount = body.chapterCount || 10
    const enhancedTheme = `${body.theme.trim()}\n\n（要求：生成 ${volumeCount} 卷，每卷约 ${chapterCount} 章）`

    const req2: OutlineGenRequest = {
      theme: enhancedTheme,
      genre: body.genre,
      targetLength: body.targetLength,
    }

    const volumes = await generator.generateVolumeStructure(req2)
    const tree = generator.toOutlineTree(volumes)

    return NextResponse.json({
      volumes,
      tree,
      stats: {
        volumeCount: volumes.length,
        chapterCount: volumes.reduce((s, v) => s + v.chapters.length, 0),
      },
    })
  } catch (err) {
    console.error('[Outline Generate] Error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    )
  }
}
