'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  BookOpen, PenLine, Users, Globe, Lightbulb, Settings, Plus, TreePine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { href: '/', label: '我的小说', icon: BookOpen, exact: true },
  { href: '/outline', label: '大纲', icon: TreePine },
  { href: '/write', label: '写作', icon: PenLine, needsNovel: true },
  { href: '/characters', label: '角色', icon: Users },
  { href: '/world', label: '世界观', icon: Globe },
  { href: '/brainstorm', label: '头脑风暴', icon: Lightbulb },
  { href: '/settings', label: '设置', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const params = useParams()
  const [lastNovelId, setLastNovelId] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = (params as { id?: string })?.id
    const stored = typeof window !== 'undefined' ? localStorage.getItem('lastNovelId') : null
    if (fromUrl) {
      setLastNovelId(fromUrl)
      localStorage.setItem('lastNovelId', fromUrl)
    } else if (stored) {
      setLastNovelId(stored)
    }
  }, [params])

  const isActive = (item: typeof NAV_ITEMS[0]) => {
    if (item.exact) return pathname === item.href
    if (item.needsNovel && lastNovelId) {
      return pathname.startsWith(`/novel/${lastNovelId}/write`)
    }
    return pathname.startsWith(item.href)
  }

  return (
    <aside className="flex h-full w-52 flex-col border-r bg-sidebar text-sidebar-foreground shrink-0">
      <Link href="/" className="flex h-14 items-center gap-2 border-b px-4 hover:bg-accent/50 transition-colors">
        <PenLine className="size-5 text-sidebar-primary" />
        <span className="font-semibold text-sm">AI 小说工作站</span>
      </Link>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const href = item.needsNovel && lastNovelId
            ? `/novel/${lastNovelId}/write`
            : item.href

          const active = isActive(item)

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <Link href="/">
          <Button className="w-full justify-start gap-2" size="sm">
            <Plus className="size-4" />
            新建小说
          </Button>
        </Link>
      </div>
    </aside>
  )
}
