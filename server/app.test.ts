import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApiApp } from './app'
import { FileStorage } from './file-storage'
import { createEmptyBatteryCounts } from '../src/shared/contracts'

describe('createApiApp', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true })
      tempDir = ''
    }
  })

  it('signs up a user, saves a layout, and exposes it by resume url', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tesla-api-'))
    const storage = new FileStorage(path.join(tempDir, 'planner-store.json'))
    const app = createApiApp(storage)
    const counts = createEmptyBatteryCounts()
    counts.megapackXL = 1

    const unauthorizedSave = await app.request('/api/layouts', {
      body: JSON.stringify({ counts }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    expect(unauthorizedSave.status).toBe(401)

    const signupResponse = await app.request('/api/auth/signup', {
      body: JSON.stringify({
        email: 'planner@example.com',
        password: 'password123',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    expect(signupResponse.status).toBe(201)

    const sessionCookie = signupResponse.headers.get('set-cookie')?.split(';')[0]

    expect(sessionCookie).toContain('planner_session=')

    const saveResponse = await app.request('/api/layouts', {
      body: JSON.stringify({ counts, isDraft: false, name: 'Alpha Yard' }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
    })

    expect(saveResponse.status).toBe(201)

    const savedPayload = (await saveResponse.json()) as {
      layout: { counts: typeof counts; isDraft: boolean; layoutId: string; name: string | null }
    }

    expect(savedPayload.layout.counts.megapackXL).toBe(1)
    expect(savedPayload.layout.isDraft).toBe(false)
    expect(savedPayload.layout.name).toBe('Alpha Yard')

    const publicLayoutResponse = await app.request(`/api/layouts/${savedPayload.layout.layoutId}`)
    expect(publicLayoutResponse.status).toBe(200)

    const publicLayout = (await publicLayoutResponse.json()) as typeof savedPayload
    expect(publicLayout.layout.layoutId).toBe(savedPayload.layout.layoutId)
    expect(publicLayout.layout.counts.megapackXL).toBe(1)
    expect(publicLayout.layout.isDraft).toBe(false)
    expect(publicLayout.layout.name).toBe('Alpha Yard')
  })

  it('lists saved layouts for the authenticated user', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tesla-api-'))
    const storage = new FileStorage(path.join(tempDir, 'planner-store.json'))
    const app = createApiApp(storage)
    const counts = createEmptyBatteryCounts()
    counts.powerPack = 2

    const signupResponse = await app.request('/api/auth/signup', {
      body: JSON.stringify({
        email: 'layouts@example.com',
        password: 'password123',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    const sessionCookie = signupResponse.headers.get('set-cookie')?.split(';')[0] ?? ''

    await app.request('/api/layouts', {
      body: JSON.stringify({ counts, isDraft: false, name: 'Service Yard' }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
      },
      method: 'POST',
    })

    const listResponse = await app.request('/api/layouts', {
      headers: {
        cookie: sessionCookie,
      },
      method: 'GET',
    })

    expect(listResponse.status).toBe(200)

    const payload = (await listResponse.json()) as {
      layouts: Array<{ counts: typeof counts; isDraft: boolean; layoutId: string; name: string | null }>
    }

    expect(payload.layouts).toHaveLength(1)
    expect(payload.layouts[0].counts.powerPack).toBe(2)
    expect(payload.layouts[0].isDraft).toBe(false)
    expect(payload.layouts[0].name).toBe('Service Yard')
  })

  it('deletes a saved project for the authenticated user', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tesla-api-'))
    const storage = new FileStorage(path.join(tempDir, 'planner-store.json'))
    const app = createApiApp(storage)
    const counts = createEmptyBatteryCounts()
    counts.megapack2 = 1

    const signupResponse = await app.request('/api/auth/signup', {
      body: JSON.stringify({
        email: 'delete@example.com',
        password: 'password123',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    const sessionCookie = signupResponse.headers.get('set-cookie')?.split(';')[0] ?? ''

    const saveResponse = await app.request('/api/layouts', {
      body: JSON.stringify({ counts, isDraft: false, name: 'Delete Me' }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
      },
      method: 'POST',
    })

    const savedPayload = (await saveResponse.json()) as {
      layout: { layoutId: string }
    }

    const deleteResponse = await app.request(`/api/layouts/${savedPayload.layout.layoutId}`, {
      headers: {
        cookie: sessionCookie,
      },
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(200)

    const listResponse = await app.request('/api/layouts', {
      headers: {
        cookie: sessionCookie,
      },
      method: 'GET',
    })

    const listPayload = (await listResponse.json()) as {
      layouts: Array<{ layoutId: string }>
    }

    expect(listPayload.layouts).toHaveLength(0)

    const publicLayoutResponse = await app.request(`/api/layouts/${savedPayload.layout.layoutId}`)
    expect(publicLayoutResponse.status).toBe(404)
  })
})
