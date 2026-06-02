import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function WritePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <PenLine className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-medium">选择一部小说开始写作</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        请先在首页选择或创建一部小说
      </p>
      <Link href="/">
        <Button>返回首页</Button>
      </Link>
    </div>
  )
}
