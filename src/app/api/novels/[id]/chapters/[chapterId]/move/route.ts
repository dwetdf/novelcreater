import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const body = await req.json()
  const direction: 'up' | 'down' = body.direction

  // Get current chapter
  const current = await prisma.chapter.findUnique({
    where: { id: chapterId, novelId },
    select: { sortOrder: true, volumeId: true },
  })
  if (!current) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })

  // Find adjacent chapter
  const adjacent = await prisma.chapter.findFirst({
    where: {
      novelId,
      volumeId: current.volumeId,
      sortOrder: direction === 'up' ? { lt: current.sortOrder } : { gt: current.sortOrder },
    },
    orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
    select: { id: true, sortOrder: true },
  })

  if (!adjacent) return NextResponse.json({ ok: true }) // Already at edge

  // Swap sort orders
  await prisma.$transaction([
    prisma.chapter.update({ where: { id: chapterId }, data: { sortOrder: adjacent.sortOrder } }),
    prisma.chapter.update({ where: { id: adjacent.id }, data: { sortOrder: current.sortOrder } }),
  ])

  return NextResponse.json({ ok: true })
}
