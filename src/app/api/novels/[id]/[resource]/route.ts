import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type SubResource = 'locations' | 'factions' | 'world-rules' | 'timeline'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; resource: string }> }
) {
  const { id: novelId, resource } = await params

  switch (resource as SubResource) {
    case 'locations': {
      const items = await prisma.location.findMany({
        where: { novelId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, description: true },
      }) as Array<{ id: string; name: string; type: string | null; description: string | null }>
      return NextResponse.json(items)
    }
    case 'factions': {
      const items = await prisma.faction.findMany({
        where: { novelId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, leaderName: true, goal: true, description: true },
      }) as Array<{ id: string; name: string; type: string | null; leaderName: string | null; goal: string | null; description: string | null }>
      return NextResponse.json(items)
    }
    case 'world-rules': {
      const items = await prisma.worldRule.findMany({
        where: { novelId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, category: true, content: true },
      }) as Array<{ id: string; title: string; category: string | null; content: string }>
      return NextResponse.json(items)
    }
    case 'timeline': {
      const items = await prisma.timelineEvent.findMany({
        where: { novelId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, description: true, eventTime: true },
      }) as Array<{ id: string; title: string; description: string | null; eventTime: string }>
      return NextResponse.json(items)
    }
    default:
      return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; resource: string }> }
) {
  const { id: novelId, resource } = await params
  const body = await req.json()

  switch (resource as SubResource) {
    case 'locations': {
      const item = await prisma.location.create({
        data: { novelId, name: body.name, type: body.type || null, description: body.description || null },
      })
      return NextResponse.json(item, { status: 201 })
    }
    case 'factions': {
      const item = await prisma.faction.create({
        data: { novelId, name: body.name, type: body.type || null, leaderName: body.leaderName || null, goal: body.goal || null, description: body.description || null },
      })
      return NextResponse.json(item, { status: 201 })
    }
    case 'world-rules': {
      const item = await prisma.worldRule.create({
        data: { novelId, title: body.title, category: body.category || null, content: body.content || '' },
      })
      return NextResponse.json(item, { status: 201 })
    }
    case 'timeline': {
      const item = await prisma.timelineEvent.create({
        data: { novelId, title: body.title, description: body.description || null, eventTime: body.eventTime || '', sortOrder: Date.now() },
      })
      return NextResponse.json(item, { status: 201 })
    }
    default:
      return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; resource: string }> }
) {
  const { id: novelId, resource } = await params
  const body = await req.json()
  const { itemId, ...fields } = body

  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })

  switch (resource as SubResource) {
    case 'locations':
      await prisma.location.updateMany({
        where: { id: itemId, novelId },
        data: { name: fields.name, type: fields.type, description: fields.description },
      })
      break
    case 'factions':
      await prisma.faction.updateMany({
        where: { id: itemId, novelId },
        data: { name: fields.name, type: fields.type, leaderName: fields.leaderName, goal: fields.goal, description: fields.description },
      })
      break
    case 'world-rules':
      await prisma.worldRule.updateMany({
        where: { id: itemId, novelId },
        data: { title: fields.title, category: fields.category, content: fields.content },
      })
      break
    case 'timeline':
      await prisma.timelineEvent.updateMany({
        where: { id: itemId, novelId },
        data: { title: fields.title, eventTime: fields.eventTime, description: fields.description },
      })
      break
    default:
      return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; resource: string }> }
) {
  const { id: novelId, resource } = await params
  const url = new URL(req.url)
  const itemId = url.searchParams.get('id')
  if (!itemId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  switch (resource as SubResource) {
    case 'locations':
      await prisma.location.deleteMany({ where: { id: itemId, novelId } })
      break
    case 'factions':
      await prisma.faction.deleteMany({ where: { id: itemId, novelId } })
      break
    case 'world-rules':
      await prisma.worldRule.deleteMany({ where: { id: itemId, novelId } })
      break
    case 'timeline':
      await prisma.timelineEvent.deleteMany({ where: { id: itemId, novelId } })
      break
    default:
      return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
