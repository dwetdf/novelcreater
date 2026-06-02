import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      volumes: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { chapters: true, characters: true } },
    },
  }) as {
    id: string; title: string; subtitle: string | null; genre: string | null
    status: string; perspective: string; tense: string
    description: string | null; targetWords: number
    createdAt: Date; updatedAt: Date
    volumes: { id: string; title: string; sortOrder: number }[]
    _count: { chapters: number; characters: number }
  } | null

  if (!novel) {
    return NextResponse.json({ error: '小说不存在' }, { status: 404 })
  }

  // Get word count
  const wordCount = await prisma.chapter.aggregate({
    where: { novelId: id },
    _sum: { wordCount: true },
  })

  return NextResponse.json({
    ...novel,
    totalWords: wordCount._sum.wordCount || 0,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const novel = await prisma.novel.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.subtitle !== undefined && { subtitle: body.subtitle }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.genre !== undefined && { genre: JSON.stringify(body.genre) }),
      ...(body.targetWords !== undefined && { targetWords: body.targetWords }),
      ...(body.perspective !== undefined && { perspective: body.perspective }),
      ...(body.tense !== undefined && { tense: body.tense }),
      ...(body.status !== undefined && { status: body.status }),
    },
  })

  return NextResponse.json(novel)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // 软删除
  await prisma.novel.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
