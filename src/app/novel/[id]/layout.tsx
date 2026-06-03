import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { NovelContextProvider } from '@/lib/context-react/novel-context'
import { NovelBreadcrumb } from './breadcrumb'

export default async function NovelLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const novel = await prisma.novel.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      subtitle: true,
      perspective: true,
      tense: true,
      genre: true,
      status: true,
    },
  })

  if (!novel) {
    notFound()
  }

  const { id: _id, ...novelData } = novel

  return (
    <NovelContextProvider novelId={id} initialNovel={novelData}>
      <NovelBreadcrumb title={novel.title} />
      {children}
    </NovelContextProvider>
  )
}
