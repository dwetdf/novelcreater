import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const body = await req.json()

  const lastVol = await prisma.volume.findFirst({
    where: { novelId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const volume = await prisma.volume.create({
    data: {
      novelId,
      title: body.title || '新卷',
      summary: body.summary || null,
      sortOrder: (lastVol?.sortOrder ?? 0) + 1,
    },
  })

  return NextResponse.json(volume, { status: 201 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const body = await req.json()

  if (!body.volumeId) {
    return NextResponse.json({ error: '缺少 volumeId' }, { status: 400 })
  }

  const volume = await prisma.volume.updateMany({
    where: { id: body.volumeId, novelId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.summary !== undefined && { summary: body.summary }),
    },
  })

  return NextResponse.json({ ok: true, updated: volume.count })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const url = new URL(req.url)
  const volId = url.searchParams.get('id')
  if (!volId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Move orphan chapters to null volume
  await prisma.chapter.updateMany({
    where: { volumeId: volId, novelId },
    data: { volumeId: null },
  })

  await prisma.volume.deleteMany({ where: { id: volId, novelId } })
  return NextResponse.json({ ok: true })
}
