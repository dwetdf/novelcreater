import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

// AES-256-GCM encryption for API keys
const ALGORITHM = 'aes-256-gcm'
const RAW_KEY = (process.env['ENCRYPTION_KEY'] || 'novelcreater-dev-key-32chars-xx')
// Ensure exactly 32 bytes for AES-256
const KEY = Buffer.alloc(32)
Buffer.from(RAW_KEY.slice(0, 32), 'utf8').copy(KEY)

function encrypt(text: string): string {
  if (!text) return '' // Don't encrypt empty strings
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(encoded: string): string {
  if (!encoded) return '' // Empty string stays empty
  try {
    const [ivHex, tagHex, dataHex] = encoded.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return encoded // Already plaintext (migration)
  }
}

function maskKey(key: string): string {
  if (!key) return '' // Empty key → show empty
  if (key.length <= 10) return '****'
  return key.slice(0, 3) + '****' + key.slice(-4)
}

function isMasked(key: string): boolean {
  return key.includes('****')
}

export async function GET() {
  const providers = await prisma.aIProvider.findMany({
    orderBy: { createdAt: 'desc' },
  }) as Array<{
    id: string; name: string; apiKey: string; baseUrl: string
    models: string; isActive: boolean; createdAt: Date; updatedAt: Date
  }>

  // Mask API keys in response
  const masked = providers.map((p) => ({
    ...p,
    apiKey: maskKey(p.apiKey),
  }))

  return NextResponse.json(masked)
}

export async function POST(req: Request) {
  const body = await req.json()

  const provider = await prisma.aIProvider.create({
    data: {
      name: body.name,
      apiKey: encrypt(body.apiKey),
      baseUrl: body.baseUrl,
      models: JSON.stringify(body.models || []),
      isActive: true,
    },
  })

  return NextResponse.json({ ...provider, apiKey: maskKey(provider.apiKey) }, { status: 201 })
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.name) data.name = body.name
    if (body.baseUrl) data.baseUrl = body.baseUrl
    if (body.models) data.models = JSON.stringify(body.models)

    // Only update apiKey if it's not masked (user entered new key)
    if (body.apiKey && !isMasked(body.apiKey)) {
      data.apiKey = encrypt(body.apiKey)
    }

    await prisma.aIProvider.update({
      where: { id: body.id },
      data,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH providers] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.aIProvider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// Also export decrypt for use by AI callers
export { decrypt }
