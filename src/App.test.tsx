import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { vi } from 'vitest'
import App from './App'

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')

  const motion = new Proxy(
    {},
    {
      get: (_target, key) => {
        const tag = typeof key === 'string' ? key : 'div'
        return ReactModule.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
          ({ children, ...props }, ref) =>
            ReactModule.createElement(tag, { ...props, ref }, children),
        )
      },
    },
  )

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  }
})

type RouteDefinition = {
  body: Record<string, unknown> | string
  contentType?: string
  method?: string
  path: string | RegExp
  status?: number
}

const fetchMock = vi.fn<typeof fetch>()

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  installFetchRoutes([
    {
      body: { user: null },
      method: 'GET',
      path: '/api/auth/session',
    },
  ])
})

describe('App', () => {
  it('renders the empty state before any batteries are added', async () => {
    render(<App />)

    expect(await screen.findByText('Add a storage module')).toBeInTheDocument()
    expect(screen.getByTestId('metric-net')).toHaveTextContent('--')
    expect(screen.getByText('00 TRANSFORMERS')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'System summary' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Stage status' })).toBeInTheDocument()
    expect(screen.getByText('Local layout')).toBeInTheDocument()
  })

  it('updates metrics and transformer count when a battery is added', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Increase MegapackXL' }))

    await waitFor(() => {
      expect(screen.getByTestId('metric-net')).toHaveTextContent('3.5 MWh')
    })

    expect(screen.getByTestId('metric-cost')).toHaveTextContent('$130,000')
    expect(screen.getByTestId('metric-land')).toHaveTextContent('500 sq ft')
    expect(screen.getByTestId('metric-density')).toHaveTextContent('7.0 kWh/sqft')
    expect(screen.getByText('01 TRANSFORMERS')).toBeInTheDocument()
    expect(screen.getByText('Local')).toBeInTheDocument()
  })

  it('does not allow counts to go below zero', async () => {
    const user = userEvent.setup()
    render(<App />)

    const megapack2Card = (await screen.findByText('Megapack2')).closest('article')

    expect(megapack2Card).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Decrease Megapack2' }))

    expect(within(megapack2Card as HTMLElement).getByText('0')).toBeInTheDocument()
    expect(screen.getByTestId('metric-cost')).toHaveTextContent('--')
  })

  it('renders all four metric pills inside the summary panel', async () => {
    render(<App />)

    const summary = await screen.findByRole('group', { name: 'System summary' })

    expect(within(summary).getByTestId('metric-net')).toBeInTheDocument()
    expect(within(summary).getByTestId('metric-cost')).toBeInTheDocument()
    expect(within(summary).getByTestId('metric-land')).toBeInTheDocument()
    expect(within(summary).getByTestId('metric-density')).toBeInTheDocument()
  })

  it('renders the stage hud with clean labels', async () => {
    render(<App />)

    const hud = await screen.findByRole('group', { name: 'Stage status' })

    expect(within(hud).getByText('Site Width')).toBeInTheDocument()
    expect(within(hud).getByText('Transformers')).toBeInTheDocument()
    expect(within(hud).getByText('Status')).toBeInTheDocument()
    expect(within(hud).getByText('100FT')).toBeInTheDocument()
  })

  it('renders layered battery casing previews in the control rail', async () => {
    render(<App />)

    const megapackCard = (await screen.findByText('MegapackXL')).closest('article')

    expect(megapackCard).not.toBeNull()
    expect((megapackCard as HTMLElement).querySelector('.battery-card__detail--cap')).not.toBeNull()
    expect((megapackCard as HTMLElement).querySelector('.battery-card__detail--badge')).not.toBeNull()
    expect((megapackCard as HTMLElement).querySelector('.battery-card__detail--vent')).not.toBeNull()
  })

  it('renders transformer hardware separately from the battery enclosures in the stage', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Increase MegapackXL' }))

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-asset-kind="transformer"] .stage-transformer__bushing-head'),
      ).toHaveLength(3)
    })

    expect(
      container.querySelector('[data-asset-kind="battery"] .stage-battery__panel'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-asset-kind="battery"] .stage-battery__accent-strip'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-asset-kind="transformer"] .stage-transformer__radiator'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-asset-kind="transformer"] .stage-transformer__accent-strip'),
    ).not.toBeNull()
  })

  it('opens an account menu and only signs out from the explicit logout action', async () => {
    const user = userEvent.setup()

    installFetchRoutes([
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: { layouts: [] },
        method: 'GET',
        path: '/api/layouts',
      },
      {
        body: { ok: true },
        method: 'POST',
        path: '/api/auth/logout',
      },
    ])

    render(<App />)

    const trigger = await screen.findByRole('button', { name: 'planner@example.com' })
    const fetchCallsBeforeOpen = fetchMock.mock.calls.length

    await user.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Account menu' })

    expect(fetchMock).toHaveBeenCalledTimes(fetchCallsBeforeOpen)
    expect(within(menu).getByText('Signed in as')).toBeInTheDocument()
    expect(within(menu).getByText('planner@example.com')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()

    await user.click(within(menu).getByRole('menuitem', { name: 'Log out' }))

    await waitFor(() => {
      expect(screen.getByText('Signed out. The current layout remains open in this browser.')).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('deletes a saved project from the library and keeps the open workspace as a draft', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    installFetchRoutes([
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: {
          layouts: [
            {
              counts: {
                megapackXL: 1,
                megapack2: 0,
                megapack: 0,
                powerPack: 0,
              },
              createdAt: '2026-04-02T18:00:00.000Z',
              isDraft: false,
              layoutId: 'layout-1',
              name: 'Alpha Yard',
              updatedAt: '2026-04-02T18:00:00.000Z',
            },
          ],
        },
        method: 'GET',
        path: '/api/layouts',
      },
      {
        body: { ok: true },
        method: 'DELETE',
        path: '/api/layouts/layout-1',
      },
    ])

    try {
      render(<App />)

      expect(await screen.findByDisplayValue('Alpha Yard')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(
          screen.getByText('Project deleted. The current workspace remains open as a draft.'),
        ).toBeInTheDocument()
      })

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete "Alpha Yard"? This will remove it from your project library.',
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/layouts/layout-1',
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        }),
      )
      expect(screen.queryByRole('button', { name: 'Open project' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument()
      expect(screen.getByText('Draft')).toBeInTheDocument()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('creates a project after signup and keeps the chosen name in the library', async () => {
    const user = userEvent.setup()

    installFetchRoutes([
      {
        body: { user: null },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'POST',
        path: '/api/auth/signup',
        status: 201,
      },
      {
        body: { layouts: [] },
        method: 'GET',
        path: '/api/layouts',
      },
      {
        body: {
          layout: {
            counts: {
              megapackXL: 1,
              megapack2: 0,
              megapack: 0,
              powerPack: 0,
            },
            createdAt: '2026-04-02T18:00:00.000Z',
            isDraft: false,
            layoutId: 'layout-1',
            name: 'Alpha Yard',
            updatedAt: '2026-04-02T18:00:00.000Z',
          },
        },
        method: 'POST',
        path: '/api/layouts',
        status: 201,
      },
      {
        body: {
          layouts: [
            {
              counts: {
                megapackXL: 1,
                megapack2: 0,
                megapack: 0,
                powerPack: 0,
              },
              createdAt: '2026-04-02T18:00:00.000Z',
              isDraft: false,
              layoutId: 'layout-1',
              name: 'Alpha Yard',
              updatedAt: '2026-04-02T18:00:00.000Z',
            },
          ],
        },
        method: 'GET',
        path: '/api/layouts',
      },
    ])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Increase MegapackXL' }))
    await user.type(screen.getByLabelText('Project name'), 'Alpha Yard')
    await user.click(screen.getByRole('button', { name: 'Sign in to create project' }))

    const dialog = screen.getByRole('dialog', { name: 'Create a planner account' })

    await user.type(within(dialog).getByLabelText('Email'), 'planner@example.com')
    await user.type(within(dialog).getByLabelText('Password'), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(screen.getByText('Project created.')).toBeInTheDocument()
    })

    expect(screen.getByText('planner@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Alpha Yard')).toBeInTheDocument()
    expect(screen.getAllByText('Alpha Yard')).toHaveLength(2)
  })

  it('loads a shared layout directly from the route parameter', async () => {
    window.history.replaceState({}, '', '/?layout=shared-layout')

    installFetchRoutes([
      {
        body: { user: null },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: {
          layout: {
            counts: {
              megapackXL: 0,
              megapack2: 1,
              megapack: 0,
              powerPack: 0,
            },
            createdAt: '2026-04-02T18:00:00.000Z',
            isDraft: false,
            layoutId: 'shared-layout',
            name: 'Shared Yard',
            updatedAt: '2026-04-02T18:00:00.000Z',
          },
        },
        method: 'GET',
        path: /\/api\/layouts\/shared-layout$/,
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('metric-net')).toHaveTextContent('2.5 MWh')
    })

    expect(screen.getByText('Workspace loaded.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Shared Yard')).toBeInTheDocument()
    expect(window.location.search).toContain('layout=shared-layout')
  })

  it('restores the most recent workspace automatically after sign in on a blank screen', async () => {
    installFetchRoutes([
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: {
          layouts: [
            {
              counts: {
                megapackXL: 0,
                megapack2: 1,
                megapack: 0,
                powerPack: 0,
              },
              createdAt: '2026-04-02T18:00:00.000Z',
              isDraft: true,
              layoutId: 'draft-1',
              name: null,
              updatedAt: '2026-04-02T18:00:00.000Z',
            },
          ],
        },
        method: 'GET',
        path: '/api/layouts',
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('metric-net')).toHaveTextContent('2.5 MWh')
    })

    expect(screen.getByText('Draft workspace')).toBeInTheDocument()
  })

  it('autosaves changes back into an opened project', async () => {
    const user = userEvent.setup()

    installFetchRoutes([
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: {
          layouts: [
            {
              counts: {
                megapackXL: 1,
                megapack2: 0,
                megapack: 0,
                powerPack: 0,
              },
              createdAt: '2026-04-02T18:00:00.000Z',
              isDraft: false,
              layoutId: 'layout-1',
              name: 'Alpha Yard',
              updatedAt: '2026-04-02T18:00:00.000Z',
            },
          ],
        },
        method: 'GET',
        path: '/api/layouts',
      },
      {
        body: {
          layout: {
            counts: {
              megapackXL: 2,
              megapack2: 0,
              megapack: 0,
              powerPack: 0,
            },
            createdAt: '2026-04-02T18:00:00.000Z',
            isDraft: false,
            layoutId: 'layout-1',
            name: 'Alpha Yard',
            updatedAt: '2026-04-02T18:05:00.000Z',
          },
        },
        method: 'POST',
        path: '/api/layouts',
      },
    ])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Increase MegapackXL' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/layouts',
        expect.objectContaining({
          body: JSON.stringify({
            counts: {
              megapackXL: 2,
              megapack2: 0,
              megapack: 0,
              powerPack: 0,
            },
            isDraft: false,
            layoutId: 'layout-1',
            name: 'Alpha Yard',
          }),
          credentials: 'include',
          method: 'POST',
        }),
      )
    })
  })

  it('keeps the main status labels stable during quick autosaves', async () => {
    vi.useFakeTimers()

    installFetchRoutes([
      {
        body: { user: { email: 'planner@example.com', userId: 'user-1' } },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: {
          layouts: [
            {
              counts: {
                megapackXL: 1,
                megapack2: 0,
                megapack: 0,
                powerPack: 0,
              },
              createdAt: '2026-04-02T18:00:00.000Z',
              isDraft: false,
              layoutId: 'layout-1',
              name: 'Demo',
              updatedAt: '2026-04-02T18:00:00.000Z',
            },
          ],
        },
        method: 'GET',
        path: '/api/layouts',
      },
      {
        body: {
          layout: {
            counts: {
              megapackXL: 2,
              megapack2: 0,
              megapack: 0,
              powerPack: 0,
            },
            createdAt: '2026-04-02T18:00:00.000Z',
            isDraft: false,
            layoutId: 'layout-1',
            name: 'Demo',
            updatedAt: '2026-04-02T18:05:00.000Z',
          },
        },
        method: 'POST',
        path: '/api/layouts',
      },
    ])

    render(<App />)

    try {
      await flushAsyncWork()

      expect(screen.getByText('PROJECT')).toBeInTheDocument()

      const stageStatus = screen.getByRole('group', { name: 'Stage status' })
      const summary = screen.getByRole('group', { name: 'System summary' })

      fireEvent.click(screen.getByRole('button', { name: 'Increase MegapackXL' }))
      await flushAsyncWork()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      await flushAsyncWork()

      expect(screen.getByText('PROJECT')).toBeInTheDocument()
      expect(within(summary).getByText('Project')).toBeInTheDocument()
      expect(screen.queryByText('SYNCING')).not.toBeInTheDocument()
      expect(within(summary).queryByText('Syncing')).not.toBeInTheDocument()
      expect(within(stageStatus).getByText('Active')).toBeInTheDocument()
      expect(within(stageStatus).queryByText('Updating')).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1400)
      })
      await flushAsyncWork()

      expect(within(summary).getByText('Project')).toBeInTheDocument()
      expect(within(stageStatus).getByText('Active')).toBeInTheDocument()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('shows a stable error instead of crashing when auth returns a non-json response', async () => {
    const user = userEvent.setup()

    installFetchRoutes([
      {
        body: { user: null },
        method: 'GET',
        path: '/api/auth/session',
      },
      {
        body: '<html>unexpected</html>',
        contentType: 'text/html',
        method: 'POST',
        path: '/api/auth/signup',
        status: 200,
      },
    ])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Create account' }))

    const dialog = screen.getByRole('dialog', { name: 'Create a planner account' })

    await user.type(within(dialog).getByLabelText('Email'), 'broken@example.com')
    await user.type(within(dialog).getByLabelText('Password'), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(screen.getByText('Unexpected response from server.')).toBeInTheDocument()
    })
  })
})

function installFetchRoutes(routes: RouteDefinition[]) {
  const queue = [...routes]

  fetchMock.mockImplementation(async (input, init) => {
    const method = resolveMethod(input, init)
    const url = resolveUrl(input)
    const routeIndex = queue.findIndex((candidate) => {
      if ((candidate.method ?? 'GET').toUpperCase() !== method) {
        return false
      }

      return typeof candidate.path === 'string'
        ? url.endsWith(candidate.path)
        : candidate.path.test(url)
    })

    if (routeIndex === -1) {
      throw new Error(`Unhandled fetch ${method} ${url}`)
    }

    const [route] = queue.splice(routeIndex, 1)

    const responseBody =
      typeof route.body === 'string' ? route.body : JSON.stringify(route.body)

    return new Response(responseBody, {
      headers: {
        'content-type': route.contentType ?? 'application/json',
      },
      status: route.status ?? 200,
    })
  })
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase()
  }

  if (input instanceof Request) {
    return input.method.toUpperCase()
  }

  return 'GET'
}

function resolveUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

async function flushAsyncWork(cycles = 3) {
  for (let index = 0; index < cycles; index += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}
