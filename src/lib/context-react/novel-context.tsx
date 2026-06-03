'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NovelContextValue {
  novelId: string
  novel: {
    title: string
    subtitle: string | null
    perspective: string
    tense: string
    genre: string | null
    status: string
    totalWords: number
  } | null
  refresh: () => void
}

const NovelContext = createContext<NovelContextValue | null>(null)

export function NovelContextProvider({
  novelId,
  initialNovel,
  children,
}: {
  novelId: string
  initialNovel: NovelContextValue['novel']
  children: ReactNode
}) {
  const [novel, setNovel] = useState(initialNovel)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
    // Re-fetch novel data
    fetch(`/api/novels/${novelId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setNovel(data)
      })
      .catch(() => {})
  }, [novelId])

  return (
    <NovelContext.Provider value={{ novelId, novel, refresh }}>
      {children}
    </NovelContext.Provider>
  )
}

export function useNovel(): NovelContextValue {
  const ctx = useContext(NovelContext)
  if (!ctx) {
    throw new Error('useNovel() must be used within a NovelContextProvider (inside /novel/[id]/layout.tsx)')
  }
  return ctx
}
