'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  BookOpen, PenLine, Users, Globe, Lightbulb, Settings, Plus, TreePine, Sparkles, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NavItem {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subPath: string            // e.g. '/outline' → resolves to /novel/[id]/outline
  exact?: boolean
  isGlobal?: boolean         // true = not novel-scoped (e.g. /settings)
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '我的小说', icon: BookOpen, subPath: '/', exact: true, isGlobal: true },
  { key: 'outline', label: '大纲', icon: TreePine, subPath: '/outline' },
  { key: 'write', label: '写作', icon: PenLine, subPath: '/write' },
  { key: 'characters', label: '角色', icon: Users, subPath: '/characters' },
  { key: 'world', label: '世界观', icon: Globe, subPath: '/world' },
  { key: 'brainstorm', label: '头脑风暴', icon: Lightbulb, subPath: '/brainstorm' },
  { key: 'foreshadowings', label: '伏笔', icon: Eye, subPath: '/foreshadowings' },
  { key: 'settings', label: '设置', icon: Settings, subPath: '/settings', isGlobal: true },
]

export function AppSidebar() {
  const pathname = usePathname()
  const params = useParams()
  const [lastNovelId, setLastNovelId] = useState<string | null>(null)

  // Resolve current novelId: URL param takes priority, localStorage fallback
  useEffect(() => {
    const fromUrl = (params as { id?: string })?.id
    if (fromUrl) {
      setLastNovelId(fromUrl)
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastNovelId', fromUrl)
      }
    } else if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lastNovelId')
      if (stored) setLastNovelId(stored)
    }
  }, [params])

  const novelId = lastNovelId

  // Build the href for a nav item
  const buildHref = (item: NavItem): string => {
    if (item.isGlobal) return item.subPath
    if (!novelId) return '/' // No novel selected → go home
    return `/novel/${novelId}${item.subPath}`
  }

  // Check if a nav item is active
  const isActive = (item: NavItem): boolean => {
    if (item.isGlobal) {
      if (item.exact) return pathname === '/'
      return pathname.startsWith(item.subPath)
    }
    if (!novelId) return false
    const prefix = `/novel/${novelId}`
    if (item.subPath === '/') {
      // Dashboard: exact match or /novel/[id] with no further path
      return pathname === prefix || pathname === `${prefix}/`
    }
    return pathname.startsWith(`${prefix}${item.subPath}`)
  }

  return (
    <aside className="flex h-full w-52 flex-col border-r bg-sidebar text-sidebar-foreground shrink-0">
      {/* Brand */}
      <Link href="/" className="flex h-14 items-center gap-2 border-b px-4 hover:bg-accent/50 transition-colors">
        <PenLine className="size-5 text-sidebar-primary" />
        <span className="font-semibold text-sm">AI 小说工作站</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const href = buildHref(item)
          const active = isActive(item)

          return (
            <Link
              key={item.key}
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

      {/* New novel button */}
      <div className="border-t p-3">
        <Link href="/novel/new">
          <Button className="w-full justify-start gap-2" size="sm">
            <Plus className="size-4" />
            新建小说
          </Button>
        </Link>
      </div>
    </aside>
  )
}
