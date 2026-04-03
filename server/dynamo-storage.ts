import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
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

type DynamoStorageConfig = {
  layoutsTableName: string
  region: string
  sessionsTableName: string
  usersTableName: string
}

export class DynamoStorage implements StorageAdapter {
  private readonly client: DynamoDBDocumentClient
  private readonly layoutsTableName: string
  private readonly sessionsTableName: string
  private readonly usersTableName: string

  constructor(config: DynamoStorageConfig) {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }))
    this.layoutsTableName = config.layoutsTableName
    this.sessionsTableName = config.sessionsTableName
    this.usersTableName = config.usersTableName
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        Key: { email },
        TableName: this.usersTableName,
      }),
    )

    return (result.Item as UserRecord | undefined) ?? null
  }

  async createUser(user: UserRecord): Promise<UserRecord> {
    try {
      await this.client.send(
        new PutCommand({
          ConditionExpression: 'attribute_not_exists(email)',
          Item: user,
          TableName: this.usersTableName,
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new DuplicateUserError(user.email)
      }

      throw error
    }

    return user
  }

  async createSession(session: SessionRecord): Promise<SessionRecord> {
    await this.client.send(
      new PutCommand({
        Item: session,
        TableName: this.sessionsTableName,
      }),
    )

    return session
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        Key: { sessionId },
        TableName: this.sessionsTableName,
      }),
    )

    const session = (result.Item as SessionRecord | undefined) ?? null

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
    await this.client.send(
      new DeleteCommand({
        Key: { sessionId },
        TableName: this.sessionsTableName,
      }),
    )
  }

  async deleteLayout(layoutId: string, userId: string): Promise<void> {
    const currentLayout = await this.findLayoutById(layoutId)

    if (!currentLayout || currentLayout.userId !== userId) {
      throw new LayoutAccessError(layoutId)
    }

    await this.client.send(
      new DeleteCommand({
        Key: { layoutId },
        TableName: this.layoutsTableName,
      }),
    )
  }

  async saveLayout(input: SaveLayoutInput): Promise<LayoutRecord> {
    const now = new Date().toISOString()

    if (input.layoutId) {
      const currentLayout = await this.findLayoutById(input.layoutId)

      if (!currentLayout || currentLayout.userId !== input.userId) {
        throw new LayoutAccessError(input.layoutId)
      }

      const updatedLayout: LayoutRecord = {
        ...currentLayout,
        counts: input.counts,
        isDraft: input.isDraft,
        name: input.name,
        updatedAt: now,
      }

      await this.client.send(
        new PutCommand({
          Item: updatedLayout,
          TableName: this.layoutsTableName,
        }),
      )

      return updatedLayout
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

    await this.client.send(
      new PutCommand({
        Item: nextLayout,
        TableName: this.layoutsTableName,
      }),
    )

    return nextLayout
  }

  async findLayoutById(layoutId: string): Promise<LayoutRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        Key: { layoutId },
        TableName: this.layoutsTableName,
      }),
    )

    return result.Item ? normalizeLayoutRecord(result.Item as Partial<LayoutRecord>) : null
  }

  async listLayoutsByUser(userId: string): Promise<LayoutRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        IndexName: 'byUser',
        KeyConditionExpression: 'userId = :userId',
        ScanIndexForward: false,
        TableName: this.layoutsTableName,
      }),
    )

    return ((result.Items as Partial<LayoutRecord>[] | undefined) ?? []).map(normalizeLayoutRecord)
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
