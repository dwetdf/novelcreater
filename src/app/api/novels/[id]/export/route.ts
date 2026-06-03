/**
 * 导出 API
 * 
 * GET /api/novels/[id]/export?format=txt|md
 * 
 * 按卷+章拼接，输出纯文本或 Markdown。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const url = new URL(req.url)
  const format = url.searchParams.get('format') || 'txt'

  // 获取小说信息
  const novel = await prisma.novel.findUnique({
    where: { id: novelId, deletedAt: null },
    select: { title: true, subtitle: true, perspective: true },
  })

  if (!novel) {
    return NextResponse.json({ error: '小说不存在' }, { status: 404 })
  }

  // 获取所有卷和章节
  const volumes = await prisma.volume.findMany({
    where: { novelId },
    orderBy: { sortOrder: 'asc' },
    include: {
      chapters: {
        orderBy: { sortOrder: 'asc' },
        select: { title: true, content: true, summary: true },
      },
    },
  }) as Array<{
    title: string; summary: string | null
    chapters: Array<{ title: string; content: string; summary: string | null }>
  }>

  // 获取孤儿章节
  const orphans = await prisma.chapter.findMany({
    where: { novelId, volumeId: null },
    orderBy: { sortOrder: 'asc' },
    select: { title: true, content: true, summary: true },
  }) as Array<{ title: string; content: string; summary: string | null }>

  const stripContent = (html: string) =>
    html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()

  if (format === 'md') {
    const lines: string[] = []
    lines.push(`# ${novel.title}`)
    if (novel.subtitle) lines.push(`> ${novel.subtitle}`)
    lines.push('')

    for (const vol of volumes) {
      lines.push(`## ${vol.title}`)
      if (vol.summary) lines.push(`*${vol.summary}*`)
      lines.push('')
      for (const ch of vol.chapters) {
        lines.push(`### ${ch.title}`)
        if (ch.summary) lines.push(`> ${ch.summary}`)
        lines.push('')
        const text = stripContent(ch.content)
        if (text) lines.push(text)
        lines.push('')
      }
    }

    if (orphans.length > 0) {
      lines.push('## 未分类章节')
      lines.push('')
      for (const ch of orphans) {
        lines.push(`### ${ch.title}`)
        const text = stripContent(ch.content)
        if (text) lines.push(text)
        lines.push('')
      }
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${novel.title}.md"`,
      },
    })
  }

  // TXT format
  const lines: string[] = []
  lines.push(`《${novel.title}》`)
  if (novel.subtitle) lines.push(novel.subtitle)
  lines.push('='.repeat(40))
  lines.push('')

  for (const vol of volumes) {
    lines.push(`【${vol.title}】`)
    lines.push('')
    for (const ch of vol.chapters) {
      lines.push(`第${ch.title}章`)
      lines.push('-'.repeat(20))
      const text = stripContent(ch.content)
      if (text) lines.push(text)
      lines.push('')
    }
  }

  if (orphans.length > 0) {
    lines.push('【未分类章节】')
    lines.push('')
    for (const ch of orphans) {
      lines.push(ch.title)
      lines.push('-'.repeat(20))
      const text = stripContent(ch.content)
      if (text) lines.push(text)
      lines.push('')
    }
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${novel.title}.txt"`,
    },
  })
}
