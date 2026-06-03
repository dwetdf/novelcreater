'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { useNovel } from '@/lib/context-react/novel-context'

const PAGE_LABELS: Record<string, string> = {
  '/outline': '大纲管理',
  '/write': '写作',
  '/characters': '角色管理',
  '/world': '世界观',
  '/brainstorm': '头脑风暴',
  '/settings': '小说设置',
}

export function NovelBreadcrumb({ title }: { title: string }) {
  const pathname = usePathname()
  const { novelId } = useNovel()

  // Extract the sub-page from pathname: /novel/[id]/outline → /outline
  const base = `/novel/${novelId}`
  const subPage = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : '/'
  const label = subPage === '/' ? '仪表盘' : PAGE_LABELS[subPage] ?? ''

  return (
    <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-muted/20 text-sm text-muted-foreground shrink-0">
      <Link href="/" className="hover:text-foreground transition-colors">
        <Home className="size-3.5" />
      </Link>
      <ChevronRight className="size-3.5" />
      <Link href={`/novel/${novelId}`} className="hover:text-foreground transition-colors font-medium text-foreground/80">
        {title}
      </Link>
      {subPage !== '/' && (
        <>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground/60">{label}</span>
        </>
      )}
    </div>
  )
}
