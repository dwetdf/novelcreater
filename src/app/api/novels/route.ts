import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const novels = await prisma.novel.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      subtitle: true,
      genre: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { chapters: true } },
    },
  }) as Array<{
    id: string; title: string; subtitle: string | null; genre: string | null
    status: string; createdAt: Date; updatedAt: Date
    _count: { chapters: number }
  }>

  const result = novels.map((n) => ({
    id: n.id,
    title: n.title,
    subtitle: n.subtitle,
    genre: n.genre ? safeJsonParse(n.genre) : [],
    status: n.status,
    chapterCount: n._count.chapters,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }))

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const body = await req.json()
  const novel = await prisma.novel.create({
    data: {
      title: body.title || '未命名小说',
      subtitle: body.subtitle || null,
      description: body.description || null,
      genre: body.genre ? JSON.stringify(body.genre) : null,
      targetWords: body.targetWords || 0,
      perspective: body.perspective || 'third',
      tense: body.tense || 'past',
      styleProfile: body.styleProfile || null,
    },
  })

  // 继承已有的嵌入配置（从任意一本已有小说的设置中复制）
  const existingSettings = await prisma.novelSettings.findFirst({
    where: { embeddingProviderId: { not: null } },
    select: { embeddingProviderId: true, embeddingModel: true },
  })

  // 自动创建小说设置（含默认 provider/model + 嵌入配置）
  await prisma.novelSettings.create({
    data: {
      novelId: novel.id,
      ...(body.defaultProviderId && { defaultProviderId: body.defaultProviderId }),
      ...(body.defaultModel && { defaultModel: body.defaultModel }),
      ...(existingSettings?.embeddingProviderId && { embeddingProviderId: existingSettings.embeddingProviderId }),
      ...(existingSettings?.embeddingModel && { embeddingModel: existingSettings.embeddingModel }),
    },
  })

  return NextResponse.json(novel, { status: 201 })
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}
