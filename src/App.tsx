import {
  type Dispatch,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type SetStateAction,
  type TransitionStartFunction,
} from 'react'
import './App.css'
import {
  ApiError,
  deleteLayout,
  fetchSession,
  getLayout,
  listLayouts,
  login,
  logout,
  saveLayout,
  signup,
} from './api'
import {
  BATTERY_MODELS,
  MAX_SITE_WIDTH_FT,
  buildPlannerScene,
  createEmptyCounts,
  formatCurrency,
  formatDensity,
  formatEnergy,
  type BatteryModel,
  type BatteryModelKey,
} from './planner'
import { StageScene } from './StageScene'
import type { LayoutSummary, SessionUser } from './shared/contracts'

type AuthMode = 'login' | 'signup'
type PostAuthAction = 'create-project' | null

function App() {
  const [counts, setCounts] = useState(createEmptyCounts)
  const [layoutId, setLayoutId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [isDraftLayout, setIsDraftLayout] = useState(false)
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [savedLayouts, setSavedLayouts] = useState<LayoutSummary[]>([])
  const [projectNotice, setProjectNotice] = useState<string | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isExplicitSaving, setIsExplicitSaving] = useState(false)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [isLayoutsLoading, setIsLayoutsLoading] = useState(false)
  const [deletingLayoutId, setDeletingLayoutId] = useState<string | null>(null)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isRouteLoading, setIsRouteLoading] = useState(false)
  const [, startTransition] = useTransition()
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const postAuthActionRef = useRef<PostAuthAction>(null)
  const lastPersistedSignatureRef = useRef(buildPersistedSignature(createEmptyCounts(), '', false))

  const scene = useMemo(() => buildPlannerScene(counts), [counts])
  const deferredScene = useDeferredValue(scene)
  const hasUnits = scene.units.length > 0
  const isStageRefreshing = isRouteLoading || isExplicitSaving
  const projectLibrary = useMemo(
    () => savedLayouts.filter((layout) => !layout.isDraft),
    [savedLayouts],
  )
  const hasSavedProject = Boolean(layoutId && !isDraftLayout)
  const showDraftWarning = hasUnits && !hasSavedProject

  useEffect(() => {
    let isCancelled = false

    const bootstrap = async () => {
      const routeLayoutId = readLayoutIdFromUrl()

      try {
        const [sessionResponse, routeLayoutResponse] = await Promise.all([
          fetchSession(),
          routeLayoutId ? getLayout(routeLayoutId).catch(() => null) : Promise.resolve(null),
        ])

        if (isCancelled) {
          return
        }

        setSessionUser(sessionResponse.user)

        if (routeLayoutResponse) {
          applyLoadedLayout(routeLayoutResponse.layout, setCounts, startTransition, {
            setIsDraftLayout,
            setLayoutId,
            setProjectName,
          })
          lastPersistedSignatureRef.current = buildPersistedSignature(
            routeLayoutResponse.layout.counts,
            routeLayoutResponse.layout.name ?? '',
            routeLayoutResponse.layout.isDraft,
          )
          setProjectNotice('Workspace loaded.')
        } else if (routeLayoutId) {
          clearRouteLayoutParam()
          setProjectError('That saved layout is no longer available.')
        }

        if (sessionResponse.user) {
          setIsLayoutsLoading(true)
          const layoutsResponse = await listLayouts()

          if (isCancelled) {
            return
          }

          setSavedLayouts(layoutsResponse.layouts)

          if (!routeLayoutResponse && layoutsResponse.layouts.length > 0) {
            const latestLayout = layoutsResponse.layouts[0]
            applyLoadedLayout(latestLayout, setCounts, startTransition, {
              setIsDraftLayout,
              setLayoutId,
              setProjectName,
            })
            lastPersistedSignatureRef.current = buildPersistedSignature(
              latestLayout.counts,
              latestLayout.name ?? '',
              latestLayout.isDraft,
            )
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setProjectError(getErrorMessage(error, 'Unable to load the planner workspace.'))
        }
      } finally {
        if (!isCancelled) {
          setIsLayoutsLoading(false)
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsAccountMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  useEffect(() => {
    if (!sessionUser && isAccountMenuOpen) {
      setIsAccountMenuOpen(false)
    }
  }, [isAccountMenuOpen, sessionUser])

  const adjustCount = (key: BatteryModelKey, delta: number) => {
    setProjectError(null)
    setProjectNotice(null)
    startTransition(() => {
      setCounts((current) => ({
        ...current,
        [key]: Math.max(0, current[key] + delta),
      }))
    })
  }

  const openAuth = (mode: AuthMode, postAuthAction: PostAuthAction = null) => {
    setAuthMode(mode)
    setAuthError(null)
    setAuthPassword('')
    postAuthActionRef.current = postAuthAction
    setIsAuthOpen(true)
  }

  const closeAuth = () => {
    setIsAuthOpen(false)
    setAuthError(null)
    postAuthActionRef.current = null
  }

  const persistWorkspace = async ({
    explicitProject = false,
    silent = false,
    userOverride = sessionUser,
  }: {
    explicitProject?: boolean
    silent?: boolean
    userOverride?: SessionUser | null
  } = {}) => {
    if (!userOverride) {
      return null
    }

    if (!hasUnits) {
      if (!silent) {
        setProjectError('Add at least one battery module before continuing.')
      }
      return null
    }

    const nextIsDraft = explicitProject ? false : isDraftLayout || !layoutId
    const normalizedName = normalizeProjectName(projectName)
    const nextName = nextIsDraft ? normalizedName : normalizedName ?? buildDefaultProjectName()

    if (silent) {
      setIsAutoSaving(true)
    } else {
      setIsExplicitSaving(true)
      setProjectError(null)
      setProjectNotice(null)
    }

    try {
      const response = await saveLayout({
        counts,
        isDraft: nextIsDraft,
        layoutId: layoutId ?? undefined,
        name: nextName,
      })

      setLayoutId(response.layout.layoutId)
      setIsDraftLayout(response.layout.isDraft)
      setProjectName(response.layout.name ?? '')
      setSavedLayouts((current) => upsertLayout(current, response.layout))
      lastPersistedSignatureRef.current = buildPersistedSignature(
        response.layout.counts,
        response.layout.name ?? '',
        response.layout.isDraft,
      )

      if (!silent) {
        setProjectNotice(
          response.layout.isDraft
            ? 'Draft updated.'
            : hasSavedProject
              ? 'Project updated.'
              : 'Project created.',
        )
      }

      return response.layout
    } catch (error) {
      if (!silent) {
        setProjectError(getErrorMessage(error, 'Unable to save this workspace right now.'))
      }
      return null
    } finally {
      if (silent) {
        setIsAutoSaving(false)
      } else {
        setIsExplicitSaving(false)
      }
    }
  }

  const triggerAutosave = useEffectEvent(() => {
    void persistWorkspace({ silent: true })
  })

  useEffect(() => {
    if (
      !sessionUser ||
      !hasUnits ||
      isBootstrapping ||
      isExplicitSaving ||
      isAutoSaving ||
      isRouteLoading
    ) {
      return
    }

    const nextIsDraft = isDraftLayout || !layoutId
    const signature = buildPersistedSignature(counts, projectName, nextIsDraft)

    if (signature === lastPersistedSignatureRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      triggerAutosave()
    }, 900)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    counts,
    hasUnits,
    isAutoSaving,
    isBootstrapping,
    isDraftLayout,
    isExplicitSaving,
    isRouteLoading,
    layoutId,
    projectName,
    sessionUser,
  ])

  const handleCreateProject = async () => {
    if (!hasUnits) {
      setProjectError('Add at least one battery module before creating a project.')
      return
    }

    if (!sessionUser) {
      setProjectNotice('Sign in to turn this layout into a saved project.')
      openAuth('signup', 'create-project')
      return
    }

    await persistWorkspace({ explicitProject: true })
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsAuthSubmitting(true)
    setAuthError(null)
    setProjectError(null)

    try {
      const payload = {
        email: authEmail,
        password: authPassword,
      }
      const authResponse =
        authMode === 'signup' ? await signup(payload) : await login(payload)
      const sessionResponse = authResponse.user ? authResponse : await fetchSession()

      if (!sessionResponse.user) {
        throw new Error('Account session could not be established. Try again.')
      }

      setSessionUser(sessionResponse.user)
      setIsAuthOpen(false)

      setIsLayoutsLoading(true)
      const layoutsResponse = await listLayouts()
      setSavedLayouts(layoutsResponse.layouts)

      const postAuthAction = postAuthActionRef.current
      postAuthActionRef.current = null

      if (postAuthAction === 'create-project') {
        await persistWorkspace({
          explicitProject: true,
          userOverride: sessionResponse.user,
        })
      } else if (!hasUnits && !layoutId && layoutsResponse.layouts.length > 0) {
        const latestLayout = layoutsResponse.layouts[0]
        applyLoadedLayout(latestLayout, setCounts, startTransition, {
          setIsDraftLayout,
          setLayoutId,
          setProjectName,
        })
        lastPersistedSignatureRef.current = buildPersistedSignature(
          latestLayout.counts,
          latestLayout.name ?? '',
          latestLayout.isDraft,
        )
      } else {
        setProjectNotice('Signed in. This workspace will autosave to your account.')
      }
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Unable to complete sign in.'))
    } finally {
      setIsLayoutsLoading(false)
      setIsAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setProjectError(null)
    setIsAccountMenuOpen(false)

    try {
      await logout()
      setSessionUser(null)
      setSavedLayouts([])
      setProjectNotice('Signed out. The current layout remains open in this browser.')
    } catch (error) {
      setProjectError(getErrorMessage(error, 'Unable to sign out right now.'))
    }
  }

  const handleLoadLayout = async (nextLayoutId: string) => {
    setIsRouteLoading(true)
    setProjectError(null)

    try {
      const response = await getLayout(nextLayoutId)
      applyLoadedLayout(response.layout, setCounts, startTransition, {
        setIsDraftLayout,
        setLayoutId,
        setProjectName,
      })
      lastPersistedSignatureRef.current = buildPersistedSignature(
        response.layout.counts,
        response.layout.name ?? '',
        response.layout.isDraft,
      )
      clearRouteLayoutParam()
      setProjectNotice(response.layout.isDraft ? 'Draft restored.' : 'Project opened.')
    } catch (error) {
      setProjectError(getErrorMessage(error, 'Unable to open that project.'))
    } finally {
      setIsRouteLoading(false)
    }
  }

  const handleDeleteLayout = async (layout: LayoutSummary) => {
    if (!sessionUser) {
      setProjectError('Sign in to manage saved projects.')
      return
    }

    const layoutName = getLayoutName(layout, 0)
    const confirmed = window.confirm(
      `Delete "${layoutName}"? This will remove it from your project library.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingLayoutId(layout.layoutId)
    setProjectError(null)
    setProjectNotice(null)

    try {
      await deleteLayout(layout.layoutId)
      setSavedLayouts((current) => current.filter((entry) => entry.layoutId !== layout.layoutId))

      if (layout.layoutId === layoutId) {
        setLayoutId(null)
        setIsDraftLayout(true)
        clearRouteLayoutParam()
        lastPersistedSignatureRef.current = buildPersistedSignature(counts, projectName, true)
        setProjectNotice('Project deleted. The current workspace remains open as a draft.')
      } else {
        setProjectNotice('Project deleted.')
      }
    } catch (error) {
      setProjectError(getErrorMessage(error, 'Unable to delete that project right now.'))
    } finally {
      setDeletingLayoutId(null)
    }
  }

  const handleNewLayout = () => {
    if (showDraftWarning) {
      const message = sessionUser
        ? 'This workspace is only a draft right now. If you start a new layout without creating a project, it will fall out of your project library. Continue?'
        : 'This layout has not been saved. Starting a new layout will remove your current progress. Continue?'

      if (!window.confirm(message)) {
        return
      }
    }

    setProjectError(null)
    setProjectNotice('New layout started.')
    setLayoutId(null)
    setProjectName('')
    setIsDraftLayout(false)
    clearRouteLayoutParam()
    lastPersistedSignatureRef.current = buildPersistedSignature(createEmptyCounts(), '', false)
    startTransition(() => {
      setCounts(createEmptyCounts())
    })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-lockup__mark" />
          <p className="brand-lockup__name">TESLA ENERGY</p>
        </div>

        <div className="topbar__cluster">
          <div className="status-lockup">
            <span>{scene.transformerCount.toString().padStart(2, '0')} TRANSFORMERS</span>
            <span>{MAX_SITE_WIDTH_FT}FT MAX</span>
            <span>{getWorkspaceStatusLabel({
              hasSavedProject,
              hasUnits,
              isDraftLayout,
              sessionUser,
            })}</span>
          </div>

          <div className="topbar__actions">
            {sessionUser ? (
              <div className="account-menu" ref={accountMenuRef}>
                <button
                  aria-controls="account-menu-panel"
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="menu"
                  className="action-pill action-pill--ghost account-menu__trigger"
                  onClick={() => setIsAccountMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="account-menu__trigger-label">{sessionUser.email}</span>
                  <span
                    aria-hidden="true"
                    className={`account-menu__trigger-icon${isAccountMenuOpen ? ' account-menu__trigger-icon--open' : ''}`}
                  />
                </button>

                {isAccountMenuOpen && (
                  <div
                    aria-label="Account menu"
                    className="account-menu__panel"
                    id="account-menu-panel"
                    role="menu"
                  >
                    <div className="account-menu__header">
                      <p className="account-menu__eyebrow">Signed in as</p>
                      <p className="account-menu__email">{sessionUser.email}</p>
                    </div>

                    <button
                      className="account-menu__item"
                      onClick={() => void handleLogout()}
                      role="menuitem"
                      type="button"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  className="action-pill"
                  onClick={() => openAuth('signup')}
                  type="button"
                >
                  Create account
                </button>
                <button
                  className="action-pill action-pill--ghost"
                  onClick={() => openAuth('login')}
                  type="button"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="experience">
        <section className="hero">
          <div className="hero__top">
            <div className="hero__copy">
              <p className="hero__eyebrow">Utility-Scale Storage Planning</p>
              <h1>Design the site layout</h1>
              <p className="hero__caption">
                Build the yard first. Turn it into a project only when you want it in the library.
              </p>

              <div className="project-bar">
                <div className="project-bar__summary">
                  <p className="project-bar__eyebrow">Active workspace</p>
                  <p className="project-bar__title">
                    {projectName || (hasSavedProject ? 'Saved project' : sessionUser ? 'Current draft' : 'Local layout')}
                  </p>
                  <p className="project-bar__caption">
                    {getWorkspaceCaption({
                      hasSavedProject,
                      hasUnits,
                      isDraftLayout,
                      sessionUser,
                    })}
                  </p>

                  <label className="project-name-field">
                    <span>Project name</span>
                    <input
                      aria-label="Project name"
                      maxLength={80}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="South Yard Phase A"
                      type="text"
                      value={projectName}
                    />
                  </label>
                </div>

                <div className="project-bar__actions">
                  {!hasSavedProject && (
                    <button
                      className="project-button"
                      disabled={!hasUnits || isExplicitSaving}
                      onClick={() => void handleCreateProject()}
                      type="button"
                    >
                      {sessionUser
                        ? isExplicitSaving
                          ? 'Creating…'
                          : 'Create project'
                        : 'Sign in to create project'}
                    </button>
                  )}
                  <button
                    className="project-button project-button--ghost"
                    onClick={handleNewLayout}
                    type="button"
                  >
                    Start new layout
                  </button>
                </div>
              </div>

              {(projectNotice || projectError) && (
                <div
                  className={`project-feedback${projectError ? ' project-feedback--error' : ''}`}
                  role="status"
                >
                  {projectError ?? projectNotice}
                </div>
              )}
            </div>

            <div className="hero__summary" role="group" aria-label="System summary">
              <div className="hero__summary-header">
                <p className="hero__summary-label">Project summary</p>
                <p className="hero__summary-state">
                  {isBootstrapping
                    ? 'Loading'
                    : hasSavedProject
                        ? 'Project'
                        : sessionUser && hasUnits
                          ? 'Draft'
                          : hasUnits
                            ? 'Local'
                            : 'Standby'}
                </p>
              </div>

              <div className="hero__metrics">
                <MetricPill
                  id="net"
                  label="Net Energy"
                  value={hasUnits ? `${formatEnergy(scene.netEnergyMWh)} MWh` : '--'}
                />
                <MetricPill
                  id="cost"
                  label="Project Cost"
                  value={hasUnits ? formatCurrency(scene.totalCost) : '--'}
                />
                <MetricPill
                  id="land"
                  label="Footprint"
                  value={hasUnits ? `${scene.footprintSqFt.toLocaleString()} sq ft` : '--'}
                />
                <MetricPill
                  id="density"
                  label="Energy Density"
                  value={hasUnits ? formatDensity(scene.energyDensityKWhPerSqFt) : '--'}
                />
              </div>

              <div className="resume-card">
                <div className="resume-card__header">
                  <div>
                    <p className="resume-card__label">Workspace state</p>
                    <p className="resume-card__value">
                      {hasSavedProject
                        ? 'This project autosaves as you work. Opening it again will restore the latest state.'
                        : sessionUser && hasUnits
                          ? 'This draft autosaves to your account. Create a project when you want it to stay in the library.'
                          : sessionUser
                            ? 'Open a project or start placing battery modules to begin a new draft.'
                            : 'Use the planner freely. Sign in only when you want to keep the workspace.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <StageScene isPending={isStageRefreshing} scene={deferredScene} />

          <section aria-label="Battery controls" className="control-rail">
            {BATTERY_MODELS.map((model) => (
              <BatteryControl
                count={counts[model.key]}
                key={model.key}
                model={model}
                onAdjust={adjustCount}
              />
            ))}
          </section>

          <section className="workspace-grid">
            <article className="workspace-card">
              <div className="workspace-card__header">
                <div>
                  <p className="workspace-card__eyebrow">Workspace</p>
                  <h2>{hasSavedProject ? 'Project linked' : sessionUser ? 'Draft workspace' : 'Local workspace'}</h2>
                </div>
                <span className="workspace-card__badge">
                  {hasSavedProject ? 'Autosaving' : sessionUser ? 'Draft only' : 'Browser only'}
                </span>
              </div>

              <p className="workspace-card__body">
                {hasSavedProject
                  ? 'Changes made here write straight back into the active project.'
                  : sessionUser
                    ? 'This workspace is persistent, but it is still a draft until you create a project from it.'
                    : 'This workspace is not attached to your account yet. Sign in when you want persistent access.'}
              </p>
            </article>

            <section className="saved-layouts" aria-label="Saved layouts">
              <div className="saved-layouts__header">
                <div>
                  <p className="workspace-card__eyebrow">Projects</p>
                  <h2>Open project</h2>
                </div>
                <span className="saved-layouts__count">
                  {sessionUser ? projectLibrary.length.toString().padStart(2, '0') : '--'}
                </span>
              </div>

              {!sessionUser ? (
                <p className="saved-layouts__empty">
                  Sign in to keep a persistent draft and reopen named projects.
                </p>
              ) : projectLibrary.length === 0 ? (
                <p className="saved-layouts__empty">
                  No projects yet. Build the layout first, then create a project from the current workspace.
                </p>
              ) : (
                <div className="saved-layouts__list">
                  {projectLibrary.map((layout, index) => (
                    <article
                      className={`saved-layout${layout.layoutId === layoutId ? ' saved-layout--active' : ''}`}
                      key={layout.layoutId}
                    >
                      <div className="saved-layout__meta">
                        <p className="saved-layout__name">{getLayoutName(layout, index)}</p>
                        <p className="saved-layout__stamp">{formatLayoutDate(layout.updatedAt)}</p>
                      </div>
                      <p className="saved-layout__summary">{describeCounts(layout)}</p>
                      <div className="saved-layout__actions">
                        <button
                          className="saved-layout__button"
                          disabled={
                            isLayoutsLoading ||
                            isRouteLoading ||
                            isAutoSaving ||
                            isExplicitSaving ||
                            deletingLayoutId !== null
                          }
                          onClick={() => void handleLoadLayout(layout.layoutId)}
                          type="button"
                        >
                          Open project
                        </button>
                        <button
                          className="saved-layout__button saved-layout__button--danger"
                          disabled={
                            isLayoutsLoading ||
                            isRouteLoading ||
                            isAutoSaving ||
                            isExplicitSaving ||
                            deletingLayoutId !== null
                          }
                          onClick={() => void handleDeleteLayout(layout)}
                          type="button"
                        >
                          {deletingLayoutId === layout.layoutId ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </section>
      </main>

      {isAuthOpen && (
        <div className="auth-modal-backdrop" role="presentation">
          <div
            aria-labelledby="auth-modal-title"
            aria-modal="true"
            className="auth-modal"
            role="dialog"
          >
            <div className="auth-modal__header">
              <div>
                <p className="auth-modal__eyebrow">Account</p>
                <h2 id="auth-modal-title">
                  {authMode === 'signup' ? 'Create a planner account' : 'Sign in to continue'}
                </h2>
              </div>
              <button
                aria-label="Close sign in dialog"
                className="auth-modal__close"
                onClick={closeAuth}
                type="button"
              >
                ×
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <input
                  autoComplete="email"
                  onChange={(event) => setAuthEmail(event.target.value)}
                  type="email"
                  value={authEmail}
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  autoComplete={
                    authMode === 'signup' ? 'new-password' : 'current-password'
                  }
                  minLength={8}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  type="password"
                  value={authPassword}
                />
              </label>

              {authError && (
                <p className="auth-form__error" role="alert">
                  {authError}
                </p>
              )}

              <div className="auth-form__actions">
                <button className="project-button" disabled={isAuthSubmitting} type="submit">
                  {isAuthSubmitting
                    ? authMode === 'signup'
                      ? 'Creating…'
                      : 'Signing in…'
                    : authMode === 'signup'
                      ? 'Create account'
                      : 'Sign in'}
                </button>
                <button
                  className="project-button project-button--ghost"
                  onClick={() =>
                    setAuthMode((current) => (current === 'signup' ? 'login' : 'signup'))
                  }
                  type="button"
                >
                  {authMode === 'signup' ? 'Use sign in' : 'Create account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function BatteryControl({
  count,
  model,
  onAdjust,
}: {
  count: number
  model: BatteryModel
  onAdjust: (key: BatteryModelKey, delta: number) => void
}) {
  return (
    <article
      className={`battery-card battery-card--${model.key}${count > 0 ? ' battery-card--active' : ''}`}
    >
      <div className="battery-card__header">
        <div className="battery-card__title">
          <span className={`battery-card__swatch battery-card__swatch--${model.key}`} />
          <div className="battery-card__text">
            <p className="battery-card__name">{model.name}</p>
            <p className="battery-card__meta">
              {formatEnergy(model.energyMWh)} MWh · {formatCurrency(model.cost)}
            </p>
          </div>
        </div>
        <span className="battery-card__count">{count}</span>
      </div>

      <div className={`battery-card__preview battery-card__preview--${model.key}`}>
        <span className="battery-card__glow" />
        <span className="battery-card__prism battery-card__prism--top" />
        <span className="battery-card__prism battery-card__prism--side" />
        <span className="battery-card__prism battery-card__prism--front" />
        <span className="battery-card__detail battery-card__detail--cap" />
        <span className="battery-card__detail battery-card__detail--badge" />
        <span className="battery-card__detail battery-card__detail--skirt" />
        <span className="battery-card__detail battery-card__detail--vent" />
      </div>

      <div className="battery-card__actions">
        <button
          aria-label={`Decrease ${model.name}`}
          className="battery-card__button"
          onClick={() => onAdjust(model.key, -1)}
          type="button"
        >
          −
        </button>
        <button
          aria-label={`Increase ${model.name}`}
          className="battery-card__button"
          onClick={() => onAdjust(model.key, 1)}
          type="button"
        >
          +
        </button>
      </div>
    </article>
  )
}

function MetricPill({
  id,
  label,
  value,
}: {
  id: string
  label: string
  value: string
}) {
  return (
    <article className="metric-pill" data-testid={`metric-${id}`}>
      <p className="metric-pill__label">{label}</p>
      <p className="metric-pill__value">{value}</p>
    </article>
  )
}

function applyLoadedLayout(
  layout: LayoutSummary,
  setCounts: Dispatch<SetStateAction<Record<BatteryModelKey, number>>>,
  startTransition: TransitionStartFunction,
  setters: {
    setIsDraftLayout: Dispatch<SetStateAction<boolean>>
    setLayoutId: Dispatch<SetStateAction<string | null>>
    setProjectName: Dispatch<SetStateAction<string>>
  },
) {
  setters.setLayoutId(layout.layoutId)
  setters.setIsDraftLayout(layout.isDraft)
  setters.setProjectName(layout.name ?? '')
  startTransition(() => {
    setCounts(layout.counts)
  })
}

function buildPersistedSignature(
  counts: Record<BatteryModelKey, number>,
  projectName: string,
  isDraft: boolean,
): string {
  return JSON.stringify({
    counts,
    isDraft,
    name: normalizeProjectName(projectName),
  })
}

function readLayoutIdFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search).get('layout')
}

function clearRouteLayoutParam() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('layout')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function describeCounts(layout: LayoutSummary): string {
  return BATTERY_MODELS.flatMap((model) => {
    const count = layout.counts[model.key]
    return count > 0 ? `${count} ${model.shortName}` : []
  }).join(' · ')
}

function getLayoutName(layout: LayoutSummary, index: number): string {
  return layout.name ?? `Project ${String(index + 1).padStart(2, '0')}`
}

function formatLayoutDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function upsertLayout(current: LayoutSummary[], layout: LayoutSummary): LayoutSummary[] {
  const next = current.filter((entry) => entry.layoutId !== layout.layoutId).concat(layout)
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function normalizeProjectName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, 80) : null
}

function buildDefaultProjectName(): string {
  const stamp = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date())
  return `Project ${stamp}`
}

function getWorkspaceCaption({
  hasSavedProject,
  hasUnits,
  isDraftLayout,
  sessionUser,
}: {
  hasSavedProject: boolean
  hasUnits: boolean
  isDraftLayout: boolean
  sessionUser: SessionUser | null
}) {
  if (hasSavedProject) {
    return 'This workspace is attached to a saved project and updates automatically as you edit.'
  }

  if (sessionUser && (isDraftLayout || hasUnits)) {
    return 'This workspace autosaves as a draft. Create a project when you want it to appear in the project library.'
  }

  if (sessionUser) {
    return 'Open an existing project or start placing storage modules to begin a fresh draft.'
  }

  return 'Anyone can start modeling the yard immediately. Sign in only when you want persistence.'
}

function getWorkspaceStatusLabel({
  hasSavedProject,
  hasUnits,
  isDraftLayout,
  sessionUser,
}: {
  hasSavedProject: boolean
  hasUnits: boolean
  isDraftLayout: boolean
  sessionUser: SessionUser | null
}) {
  if (hasSavedProject) {
    return 'PROJECT'
  }

  if (sessionUser && (isDraftLayout || hasUnits)) {
    return 'DRAFT'
  }

  if (hasUnits) {
    return 'LOCAL'
  }

  return 'STANDBY'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export default App
