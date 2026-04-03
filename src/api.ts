import type {
  AuthPayload,
  LayoutListResponse,
  LayoutResponse,
  SaveLayoutPayload,
  SessionResponse,
} from './shared/contracts'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchSession() {
  return request<SessionResponse>('/api/auth/session')
}

export async function signup(payload: AuthPayload) {
  return request<SessionResponse>('/api/auth/signup', {
    body: JSON.stringify(payload),
    method: 'POST',
  })
}

export async function login(payload: AuthPayload) {
  return request<SessionResponse>('/api/auth/login', {
    body: JSON.stringify(payload),
    method: 'POST',
  })
}

export async function logout() {
  return request<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function listLayouts() {
  return request<LayoutListResponse>('/api/layouts')
}

export async function saveLayout(payload: SaveLayoutPayload) {
  return request<LayoutResponse>('/api/layouts', {
    body: JSON.stringify(payload),
    method: 'POST',
  })
}

export async function getLayout(layoutId: string) {
  return request<LayoutResponse>(`/api/layouts/${encodeURIComponent(layoutId)}`)
}

export async function deleteLayout(layoutId: string) {
  return request<{ ok: true }>(`/api/layouts/${encodeURIComponent(layoutId)}`, {
    method: 'DELETE',
  })
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}.`
    throw new ApiError(message, response.status)
  }

  if (!payload) {
    throw new ApiError('Unexpected response from server.', response.status)
  }

  return payload as T
}

async function parseJson(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
