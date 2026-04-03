import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createEmptyBatteryCounts } from '../src/shared/contracts'
import { createId } from './auth'
import {
  DuplicateUserError,
  LayoutAccessError,
  type LayoutRecord,
  type SaveLayoutInput,
  type SessionRecord,
  type StorageAdapter,
  type UserRecord,
} from './storage'

type FileDatabase = {
  layouts: LayoutRecord[]
  sessions: SessionRecord[]
  users: UserRecord[]
}

export class FileStorage implements StorageAdapter {
  private readonly filePath: string
  private writeChain: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const data = await this.readDatabase()
    return data.users.find((user) => user.email === email) ?? null
  }

  async createUser(user: UserRecord): Promise<UserRecord> {
    return this.updateDatabase((data) => {
      if (data.users.some((existingUser) => existingUser.email === user.email)) {
        throw new DuplicateUserError(user.email)
      }

      data.users.push(user)
      return user
    })
  }

  async createSession(session: SessionRecord): Promise<SessionRecord> {
    return this.updateDatabase((data) => {
      data.sessions = data.sessions
        .filter((existingSession) => existingSession.userId !== session.userId)
        .concat(session)
      return session
    })
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    const data = await this.readDatabase()
    const session = data.sessions.find((existingSession) => existingSession.sessionId === sessionId) ?? null

    if (!session) {
      return null
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.deleteSession(sessionId)
      return null
    }

    return session
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.updateDatabase((data) => {
      data.sessions = data.sessions.filter((session) => session.sessionId !== sessionId)
    })
  }

  async deleteLayout(layoutId: string, userId: string): Promise<void> {
    await this.updateDatabase((data) => {
      const currentLayout = data.layouts.find((layout) => layout.layoutId === layoutId)

      if (!currentLayout || currentLayout.userId !== userId) {
        throw new LayoutAccessError(layoutId)
      }

      data.layouts = data.layouts.filter((layout) => layout.layoutId !== layoutId)
    })
  }

  async saveLayout(input: SaveLayoutInput): Promise<LayoutRecord> {
    return this.updateDatabase((data) => {
      const now = new Date().toISOString()

      if (input.layoutId) {
        const currentLayout = data.layouts.find((layout) => layout.layoutId === input.layoutId)

        if (!currentLayout || currentLayout.userId !== input.userId) {
          throw new LayoutAccessError(input.layoutId)
        }

        currentLayout.counts = input.counts
        currentLayout.isDraft = input.isDraft
        currentLayout.name = input.name
        currentLayout.updatedAt = now
        return currentLayout
      }

      const nextLayout: LayoutRecord = {
        counts: input.counts,
        createdAt: now,
        isDraft: input.isDraft,
        layoutId: createId(16),
        name: input.name,
        updatedAt: now,
        userId: input.userId,
      }

      data.layouts.push(nextLayout)
      return nextLayout
    })
  }

  async findLayoutById(layoutId: string): Promise<LayoutRecord | null> {
    const data = await this.readDatabase()
    return data.layouts.find((layout) => layout.layoutId === layoutId) ?? null
  }

  async listLayoutsByUser(userId: string): Promise<LayoutRecord[]> {
    const data = await this.readDatabase()
    return data.layouts
      .filter((layout) => layout.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  private async readDatabase(): Promise<FileDatabase> {
    await mkdir(path.dirname(this.filePath), { recursive: true })

    try {
      const contents = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(contents) as Partial<FileDatabase>
      return {
        layouts: (parsed.layouts ?? []).map(normalizeLayoutRecord),
        sessions: parsed.sessions ?? [],
        users: parsed.users ?? [],
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const initialDatabase: FileDatabase = { layouts: [], sessions: [], users: [] }
        await this.persistDatabase(initialDatabase)
        return initialDatabase
      }

      throw error
    }
  }

  private async persistDatabase(data: FileDatabase): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(data, null, 2))
  }

  private async updateDatabase<T>(mutate: (data: FileDatabase) => T): Promise<T> {
    let result: T | undefined

    this.writeChain = this.writeChain.then(async () => {
      const data = await this.readDatabase()
      result = mutate(data)
      await this.persistDatabase(data)
    })

    await this.writeChain
    return result as T
  }
}

function normalizeLayoutRecord(layout: Partial<LayoutRecord>): LayoutRecord {
  return {
    counts: layout.counts ?? createEmptyBatteryCounts(),
    createdAt: layout.createdAt ?? new Date(0).toISOString(),
    isDraft: layout.isDraft ?? false,
    layoutId: layout.layoutId ?? '',
    name: layout.name ?? null,
    updatedAt: layout.updatedAt ?? layout.createdAt ?? new Date(0).toISOString(),
    userId: layout.userId ?? '',
  }
}
