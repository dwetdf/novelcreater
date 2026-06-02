import { PrismaClient } from "@/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

// Prisma 7 requires a driver adapter. Use better-sqlite3 adapter with file URL.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _PC = PrismaClient as any

let _instance: any = null

function getInstance(): any {
  if (_instance) return _instance

  const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" })

  _instance = new _PC({ adapter })
  return _instance
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new Proxy({} as any, {
  get(_target: any, prop: string | symbol) {
    const instance = getInstance()
    const val = instance[prop]
    return typeof val === "function" ? val.bind(instance) : val
  },
})
