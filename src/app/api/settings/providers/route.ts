import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const providers = await prisma.aIProvider.findMany({
    orderBy: { createdAt: 'desc' },
  }) as Array<{
    id: string; name: string; apiKey: string; baseUrl: string
    models: string; isActive: boolean; createdAt: Date; updatedAt: Date
  }>

  return NextResponse.json(providers)
}

export async function POST(req: Request) {
  const body = await req.json()

  const provider = await prisma.aIProvider.create({
    data: {
      name: body.name,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      models: JSON.stringify(body.models || []),
      isActive: true,
    },
  })

  return NextResponse.json(provider, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()

  await prisma.aIProvider.update({
    where: { id: body.id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.name && { name: body.name }),
      ...(body.apiKey && { apiKey: body.apiKey }),
      ...(body.baseUrl && { baseUrl: body.baseUrl }),
      ...(body.models && { models: JSON.stringify(body.models) }),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.aIProvider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
