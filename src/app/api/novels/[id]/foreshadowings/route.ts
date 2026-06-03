/**
 * 伏笔管理 API
 * 
 * GET    /api/novels/[id]/foreshadowings — 列出所有伏笔
 * POST   /api/novels/[id]/foreshadowings — 手动创建
 * PATCH  /api/novels/[id]/foreshadowings — 更新状态 (body: { id, status?, planRecycleChapterId?, actualRecycleChapterId? })
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { foreshadowRepo } from '@/lib/context/storage/foreshadow-repo'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const url = new URL(_req.url)
  const status = url.searchParams.get('status') // optional filter

  const where: Record<string, unknown> = { novelId }
  if (status) where.status = status

  const items = await prisma.foreshadowing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      plantChapter: { select: { title: true, sortOrder: true } },
      planRecycleChapter: { select: { title: true, sortOrder: true } },
      actualRecycleChapter: { select: { title: true, sortOrder: true } },
    },
  })

  return NextResponse.json(items)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const body = await req.json()

  const item = await foreshadowRepo.create({
    novelId,
    content: body.content,
    type: body.type,
    plantChapterId: body.plantChapterId,
    plantPosition: body.plantPosition,
    planRecycleChapterId: body.planRecycleChapterId,
    relatedCharacterIds: body.relatedCharacterIds,
    notes: body.notes,
  })

  return NextResponse.json(item, { status: 201 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const body = await req.json()

  if (body.status === 'closed' && body.actualRecycleChapterId) {
    await foreshadowRepo.markClosed(body.id, body.actualRecycleChapterId)
  } else if (body.status === 'discarded') {
    await foreshadowRepo.markDiscarded(body.id)
  } else {
    // Generic update
    await prisma.foreshadowing.updateMany({
      where: { id: body.id, novelId },
      data: {
        ...(body.planRecycleChapterId !== undefined && { planRecycleChapterId: body.planRecycleChapterId }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    })
  }

  return NextResponse.json({ ok: true })
}
