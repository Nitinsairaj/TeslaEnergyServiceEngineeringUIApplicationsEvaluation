import path from 'node:path'
import type { BatteryCounts } from '../src/shared/contracts'
import { DynamoStorage } from './dynamo-storage'
import { FileStorage } from './file-storage'

export type UserRecord = {
  createdAt: string
  email: string
  passwordHash: string
  updatedAt: string
  userId: string
}

export type SessionRecord = {
  createdAt: string
  email: string
  expiresAt: string
  sessionId: string
  userId: string
}

export type LayoutRecord = {
  counts: BatteryCounts
  createdAt: string
  isDraft: boolean
  layoutId: string
  name: string | null
  updatedAt: string
  userId: string
}

export type SaveLayoutInput = {
  counts: BatteryCounts
  isDraft: boolean
  layoutId?: string
  name: string | null
  userId: string
}

export interface StorageAdapter {
  createSession(session: SessionRecord): Promise<SessionRecord>
  createUser(user: UserRecord): Promise<UserRecord>
  deleteLayout(layoutId: string, userId: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  findLayoutById(layoutId: string): Promise<LayoutRecord | null>
  findSession(sessionId: string): Promise<SessionRecord | null>
  findUserByEmail(email: string): Promise<UserRecord | null>
  listLayoutsByUser(userId: string): Promise<LayoutRecord[]>
  saveLayout(input: SaveLayoutInput): Promise<LayoutRecord>
}

export class DuplicateUserError extends Error {
  constructor(email: string) {
    super(`User already exists for ${email}`)
    this.name = 'DuplicateUserError'
  }
}

export class LayoutAccessError extends Error {
  constructor(layoutId: string) {
    super(`Layout ${layoutId} is not available for this user`)
    this.name = 'LayoutAccessError'
  }
}

let cachedStorage: StorageAdapter | null = null

export function createStorageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageAdapter {
  if (cachedStorage) {
    return cachedStorage
  }

  if (env.APP_STORAGE === 'dynamo') {
    cachedStorage = new DynamoStorage({
      layoutsTableName: env.LAYOUTS_TABLE_NAME ?? 'planner-layouts',
      region: env.AWS_REGION ?? env.CDK_DEFAULT_REGION ?? 'us-west-2',
      sessionsTableName: env.SESSIONS_TABLE_NAME ?? 'planner-sessions',
      usersTableName: env.USERS_TABLE_NAME ?? 'planner-users',
    })

    return cachedStorage
  }

  cachedStorage = new FileStorage(
    env.DATA_FILE_PATH ?? path.resolve(process.cwd(), '.data', 'planner-store.json'),
  )
  return cachedStorage
}
