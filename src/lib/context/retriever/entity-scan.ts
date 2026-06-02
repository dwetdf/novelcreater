/**
 * EntityScanner — 实体扫描
 * 
 * 从文本中检测已注册的角色名、地点名、势力名。
 * 使用 Trie 树实现高效的多模式匹配。
 */

import { prisma } from '@/lib/db/prisma'
import type { EntityMatch } from '../types'

interface TrieNode {
  children: Map<string, TrieNode>
  isEnd: boolean
  entityType?: 'character' | 'location' | 'faction'
  entityId?: string
  entityName?: string
}

export class EntityScanner {
  private trie: TrieNode | null = null
  private novelId: string | null = null
  private entityCount: number = 0

  /** 构建当前小说的实体 Trie */
  async buildTrie(novelId: string): Promise<void> {
    if (this.trie && this.novelId === novelId) return // 已缓存

    this.novelId = novelId
    this.trie = { children: new Map(), isEnd: false }
    this.entityCount = 0

    const [characters, locations, factions] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, aliases: true },
      }),
      prisma.location.findMany({
        where: { novelId },
        select: { id: true, name: true },
      }),
      prisma.faction.findMany({
        where: { novelId },
        select: { id: true, name: true },
      }),
    ])

    for (const char of characters) {
      this.insert(char.name, 'character', char.id, char.name)
      if (char.aliases) {
        try {
          const aliases: string[] = JSON.parse(char.aliases)
          for (const alias of aliases) {
            this.insert(alias, 'character', char.id, char.name)
          }
        } catch { /* ignore */ }
      }
    }

    for (const loc of locations) {
      this.insert(loc.name, 'location', loc.id, loc.name)
    }

    for (const fac of factions) {
      this.insert(fac.name, 'faction', fac.id, fac.name)
    }

    this.entityCount = characters.length + locations.length + factions.length
  }

  /** 向 Trie 中插入实体名 */
  private insert(
    name: string,
    type: 'character' | 'location' | 'faction',
    id: string,
    originalName: string,
  ): void {
    if (!name || name.length < 2) return // 跳过单字名
    if (!this.trie) return

    let node = this.trie
    for (const char of name) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), isEnd: false })
      }
      node = node.children.get(char)!
    }
    node.isEnd = true
    node.entityType = type
    node.entityId = id
    node.entityName = originalName
  }

  /** 扫描文本中的实体 */
  scan(text: string): EntityMatch[] {
    if (!this.trie || !text) return []

    const matches = new Map<string, EntityMatch>()

    // 滑动窗口扫描
    for (let i = 0; i < text.length; i++) {
      let node: TrieNode | undefined = this.trie
      let j = i
      let lastMatch: { type: string; id: string; name: string; end: number } | null = null

      while (j < text.length && node) {
        node = node.children.get(text[j])
        if (node?.isEnd) {
          lastMatch = {
            type: node.entityType!,
            id: node.entityId!,
            name: node.entityName!,
            end: j + 1,
          }
        }
        j++
      }

      if (lastMatch) {
        const matchedText = text.slice(i, lastMatch.end)
        const key = lastMatch.id
        
        if (matches.has(key)) {
          matches.get(key)!.frequency++
        } else {
          matches.set(key, {
            type: lastMatch.type as EntityMatch['type'],
            id: lastMatch.id,
            name: lastMatch.name,
            matchedText,
            frequency: 1,
          })
        }
        // 跳过已匹配的字符
        i = lastMatch.end - 1
      }
    }

    // 按出场频率降序排列
    return Array.from(matches.values()).sort((a, b) => b.frequency - a.frequency)
  }

  /** 检查 Trie 是否已加载 */
  isLoaded(): boolean {
    return this.trie !== null
  }

  /** 获取实体数量 */
  getEntityCount(): number {
    return this.entityCount
  }

  /** 清除缓存 */
  clear(): void {
    this.trie = null
    this.novelId = null
    this.entityCount = 0
  }
}

// ─── 单例 ────────────────────────────────────────

let entityScannerInstance: EntityScanner | null = null

export function getEntityScanner(): EntityScanner {
  if (!entityScannerInstance) {
    entityScannerInstance = new EntityScanner()
  }
  return entityScannerInstance
}
