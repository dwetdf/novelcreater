import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const chapters = await prisma.chapter.findMany({
    where: { novelId: id },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
      sortOrder: true,
      status: true,
      summary: true,
      wordCount: true,
      targetWords: true,
      volumeId: true,
      volume: { select: { title: true } },
    },
  }) as Array<{
    id: string; title: string; content: string; sortOrder: number
    status: string; summary: string | null; wordCount: number
    targetWords: number; volumeId: string | null
    volume: { title: string } | null
  }>

  return NextResponse.json(chapters)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const chapter = await prisma.chapter.create({
    data: {
      novelId: id,
      volumeId: body.volumeId || null,
      title: body.title || '新章节',
      summary: body.summary || null,
      content: body.content || '',
      targetWords: body.targetWords || 3000,
      sortOrder: body.sortOrder ?? await getNextSortOrder(id),
    },
  })

  return NextResponse.json(chapter, { status: 201 })
}

async function getNextSortOrder(novelId: string): Promise<number> {
  const last = await prisma.chapter.findFirst({
    where: { novelId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  return (last?.sortOrder ?? 0) + 1
}
