import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, novelId },
    select: {
      id: true, title: true, content: true, summary: true,
      sortOrder: true, status: true, wordCount: true, targetWords: true,
      volumeId: true, volume: { select: { title: true } },
    },
  }) as {
    id: string; title: string; content: string; summary: string | null
    sortOrder: number; status: string; wordCount: number; targetWords: number
    volumeId: string | null; volume: { title: string } | null
  } | null

  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  return NextResponse.json(chapter)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const body = await req.json()

  const chapter = await prisma.chapter.update({
    where: { id: chapterId, novelId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.summary !== undefined && { summary: body.summary }),
      ...(body.content !== undefined && { content: body.content, wordCount: body.content.replace(/<[^>]*>/g, '').replace(/\s/g, '').length }),
      ...(body.targetWords !== undefined && { targetWords: body.targetWords }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.volumeId !== undefined && { volumeId: body.volumeId }),
    },
  })

  return NextResponse.json(chapter)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  await prisma.chapter.deleteMany({ where: { id: chapterId, novelId } })
  return NextResponse.json({ ok: true })
}
