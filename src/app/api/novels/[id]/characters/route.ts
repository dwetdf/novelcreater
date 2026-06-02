import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const characters = await prisma.character.findMany({
    where: { novelId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, role: true, gender: true, age: true,
      personality: true, appearance: true, background: true,
      motivation: true, weakness: true, catchphrase: true, abilities: true,
      novelId: true, novel: { select: { id: true, title: true } },
    },
  }) as Array<{
    id: string; name: string; role: string | null; gender: string | null
    age: string | null; personality: string | null; appearance: string | null
    background: string | null; motivation: string | null; weakness: string | null
    catchphrase: string | null; abilities: string | null
    novelId: string; novel: { id: string; title: string }
  }>

  return NextResponse.json(characters)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const character = await prisma.character.create({
    data: {
      novelId: id,
      name: body.name,
      role: body.role || null,
      gender: body.gender || null,
      age: body.age || null,
      personality: body.personality || null,
      appearance: body.appearance || null,
      background: body.background || null,
      motivation: body.motivation || null,
      weakness: body.weakness || null,
      catchphrase: body.catchphrase || null,
      abilities: body.abilities || null,
    },
  })

  return NextResponse.json(character, { status: 201 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const body = await req.json()
  const { charId, ...fields } = body

  if (!charId) return NextResponse.json({ error: 'Missing charId' }, { status: 400 })

  const updateData: Record<string, string | null> = {}
  const allowedFields = ['name', 'role', 'gender', 'age', 'personality', 'appearance', 'background', 'motivation', 'weakness', 'catchphrase', 'abilities']
  for (const f of allowedFields) {
    if (f in fields) updateData[f] = fields[f] || null
  }

  const character = await prisma.character.updateMany({
    where: { id: charId, novelId },
    data: updateData,
  })

  return NextResponse.json(character)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params
  const url = new URL(req.url)
  const charId = url.searchParams.get('id')
  if (!charId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.character.deleteMany({
    where: { id: charId, novelId },
  })
  return NextResponse.json({ ok: true })
}
