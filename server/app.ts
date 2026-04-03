import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  sanitizeLayoutName,
  sanitizeBatteryCounts,
  totalConfiguredUnits,
  type AuthPayload,
  type LayoutListResponse,
  type LayoutResponse,
  type LayoutSummary,
  type SaveLayoutPayload,
  type SessionResponse,
  type SessionUser,
} from '../src/shared/contracts'
import {
  createId,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from './auth'
import {
  createStorageFromEnv,
  DuplicateUserError,
  LayoutAccessError,
  type LayoutRecord,
  type SessionRecord,
  type StorageAdapter,
  type UserRecord,
} from './storage'

type AppVariables = {
  session: SessionRecord | null
  storage: StorageAdapter
}

type ApiContext = Context<{ Variables: AppVariables }>

export function createApiApp(storage: StorageAdapter = createStorageFromEnv()) {
  const app = new Hono<{ Variables: AppVariables }>()

  app.use('/api/*', async (context, next) => {
    context.header('Cache-Control', 'no-store')
    context.set('storage', storage)
    context.set('session', null)

    const sessionId = getCookie(context, SESSION_COOKIE_NAME)

    if (sessionId) {
      const session = await storage.findSession(sessionId)

      if (session) {
        context.set('session', session)
      } else {
        deleteCookie(context, SESSION_COOKIE_NAME, { path: '/' })
      }
    }

    await next()
  })

  app.get('/api/health', (context) => context.json({ ok: true }))

  app.get('/api/auth/session', (context) => {
    const response: SessionResponse = {
      user: toSessionUser(context.get('session')),
    }

    return context.json(response)
  })

  app.post('/api/auth/signup', async (context) => {
    const payload = await readJsonBody<AuthPayload>(context)

    if (!payload) {
      return context.json({ error: 'Invalid request payload.' }, 400)
    }

    const email = normalizeEmail(payload.email ?? '')
    const password = payload.password ?? ''

    if (!isValidEmail(email)) {
      return context.json({ error: 'Enter a valid email address.' }, 400)
    }

    if (!isValidPassword(password)) {
      return context.json({ error: 'Passwords must be at least 8 characters.' }, 400)
    }

    const now = new Date().toISOString()
    const user: UserRecord = {
      createdAt: now,
      email,
      passwordHash: await hashPassword(password),
      updatedAt: now,
      userId: createId(15),
    }

    try {
      await storage.createUser(user)
    } catch (error) {
      if (error instanceof DuplicateUserError) {
        return context.json({ error: 'An account already exists for that email.' }, 409)
      }

      throw error
    }

    const session = await storage.createSession(createSessionRecord(user))
    setSessionCookie(context, session.sessionId)

    const response: SessionResponse = {
      user: toSessionUser(session),
    }

    return context.json(response, 201)
  })

  app.post('/api/auth/login', async (context) => {
    const payload = await readJsonBody<AuthPayload>(context)

    if (!payload) {
      return context.json({ error: 'Invalid request payload.' }, 400)
    }

    const email = normalizeEmail(payload.email ?? '')
    const password = payload.password ?? ''
    const user = await storage.findUserByEmail(email)

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return context.json({ error: 'Email or password is incorrect.' }, 401)
    }

    const session = await storage.createSession(createSessionRecord(user))
    setSessionCookie(context, session.sessionId)

    const response: SessionResponse = {
      user: toSessionUser(session),
    }

    return context.json(response)
  })

  app.post('/api/auth/logout', async (context) => {
    const session = context.get('session')

    if (session) {
      await storage.deleteSession(session.sessionId)
    }

    deleteCookie(context, SESSION_COOKIE_NAME, { path: '/' })
    return context.json({ ok: true })
  })

  app.get('/api/layouts', async (context) => {
    const session = context.get('session')

    if (!session) {
      return context.json({ error: 'Sign in to access saved layouts.' }, 401)
    }

    const layouts = await storage.listLayoutsByUser(session.userId)
    const response: LayoutListResponse = {
      layouts: layouts.map(toLayoutSummary),
    }

    return context.json(response)
  })

  app.post('/api/layouts', async (context) => {
    const session = context.get('session')

    if (!session) {
      return context.json({ error: 'Sign in to save layouts.' }, 401)
    }

    const payload = await readJsonBody<SaveLayoutPayload>(context)

    if (!payload) {
      return context.json({ error: 'Invalid request payload.' }, 400)
    }

    const counts = sanitizeBatteryCounts(payload.counts)
    const isDraft = payload.isDraft === true
    const name = sanitizeLayoutName(payload.name)

    if (totalConfiguredUnits(counts) === 0) {
      return context.json({ error: 'Add at least one battery before saving.' }, 400)
    }

    try {
      const layout = await storage.saveLayout({
        counts,
        isDraft,
        layoutId: payload.layoutId,
        name,
        userId: session.userId,
      })

      const response: LayoutResponse = {
        layout: toLayoutSummary(layout),
      }

      return context.json(response, payload.layoutId ? 200 : 201)
    } catch (error) {
      if (error instanceof LayoutAccessError) {
        return context.json({ error: 'That layout is no longer available.' }, 404)
      }

      throw error
    }
  })

  app.get('/api/layouts/:layoutId', async (context) => {
    const layoutId = context.req.param('layoutId')
    const layout = await storage.findLayoutById(layoutId)

    if (!layout) {
      return context.json({ error: 'Layout not found.' }, 404)
    }

    const response: LayoutResponse = {
      layout: toLayoutSummary(layout),
    }

    return context.json(response)
  })

  app.delete('/api/layouts/:layoutId', async (context) => {
    const session = context.get('session')

    if (!session) {
      return context.json({ error: 'Sign in to manage saved layouts.' }, 401)
    }

    const layoutId = context.req.param('layoutId')

    try {
      await storage.deleteLayout(layoutId, session.userId)
      return context.json({ ok: true })
    } catch (error) {
      if (error instanceof LayoutAccessError) {
        return context.json({ error: 'That layout is no longer available.' }, 404)
      }

      throw error
    }
  })

  app.onError((error, context) => {
    console.error(error)
    return context.json({ error: 'Something went wrong.' }, 500)
  })

  return app
}

function createSessionRecord(user: Pick<UserRecord, 'email' | 'userId'>): SessionRecord {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)

  return {
    createdAt: now.toISOString(),
    email: user.email,
    expiresAt: expiresAt.toISOString(),
    sessionId: createId(24),
    userId: user.userId,
  }
}

function toSessionUser(session: SessionRecord | null): SessionUser | null {
  if (!session) {
    return null
  }

  return {
    email: session.email,
    userId: session.userId,
  }
}

function toLayoutSummary(layout: LayoutRecord): LayoutSummary {
  return {
    counts: layout.counts,
    createdAt: layout.createdAt,
    isDraft: layout.isDraft ?? false,
    layoutId: layout.layoutId,
    name: layout.name ?? null,
    updatedAt: layout.updatedAt,
  }
}

async function readJsonBody<T>(context: ApiContext): Promise<T | null> {
  try {
    return (await context.req.json()) as T
  } catch {
    return null
  }
}

function setSessionCookie(context: ApiContext, sessionId: string): void {
  setCookie(context, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure: isSecureRuntime(context.req.url),
  })
}

function isSecureRuntime(requestUrl: string): boolean {
  return requestUrl.startsWith('https://') || process.env.APP_ENV === 'production'
}
