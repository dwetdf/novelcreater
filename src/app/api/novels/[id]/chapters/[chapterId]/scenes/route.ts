/**
 * 场景 CRUD API
 * 
 * GET    /api/novels/[id]/chapters/[chapterId]/scenes — 获取所有场景
 * POST   /api/novels/[id]/chapters/[chapterId]/scenes — 创建场景
 * PATCH  /api/novels/[id]/chapters/[chapterId]/scenes — 更新场景 (body: { sceneId, ... })
 * DELETE /api/novels/[id]/chapters/[chapterId]/scenes — 删除场景 (?sceneId=...)
 */

import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── GET: 获取章节的所有场景 ───────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  const scenes = await prisma.chapterScene.findMany({
    where: { chapterId, novelId },
    orderBy: { seq: 'asc' },
  }) as Array<{
    id: string; chapterId: string; novelId: string; seq: number
    title: string; setting: string | null; characters: string | null
    conflict: string | null; outcome: string | null
    emotionalBeat: string | null; notes: string | null
  }>

  return NextResponse.json(scenes)
}

// ─── POST: 创建新场景 ─────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const body = await req.json()

  // 自动分配 seq
  const lastScene = await prisma.chapterScene.findFirst({
    where: { chapterId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })
  const seq = (lastScene?.seq ?? 0) + 1

  const scene = await prisma.chapterScene.create({
    data: {
      chapterId,
      novelId,
      seq,
      title: body.title || `场景 ${seq}`,
      setting: body.setting || null,
      characters: body.characters ? JSON.stringify(body.characters) : null,
      conflict: body.conflict || null,
      outcome: body.outcome || null,
      emotionalBeat: body.emotionalBeat || null,
      notes: body.notes || null,
    },
  })

  return NextResponse.json(scene, { status: 201 })
}

// ─── PATCH: 更新场景 ──────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const body = await req.json()

  if (!body.sceneId) {
    return NextResponse.json({ error: '缺少 sceneId' }, { status: 400 })
  }

  const scene = await prisma.chapterScene.updateMany({
    where: { id: body.sceneId, chapterId, novelId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.setting !== undefined && { setting: body.setting }),
      ...(body.characters !== undefined && { characters: typeof body.characters === 'string' ? body.characters : JSON.stringify(body.characters) }),
      ...(body.conflict !== undefined && { conflict: body.conflict }),
      ...(body.outcome !== undefined && { outcome: body.outcome }),
      ...(body.emotionalBeat !== undefined && { emotionalBeat: body.emotionalBeat }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.seq !== undefined && { seq: body.seq }),
    },
  })

  return NextResponse.json({ ok: true, updated: scene.count })
}

// ─── DELETE: 删除场景 ─────────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params
  const url = new URL(req.url)
  const sceneId = url.searchParams.get('sceneId')
  if (!sceneId) return NextResponse.json({ error: '缺少 sceneId' }, { status: 400 })

  await prisma.chapterScene.deleteMany({
    where: { id: sceneId, chapterId, novelId },
  })

  return NextResponse.json({ ok: true })
}
