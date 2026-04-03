# Tesla Energy Planner

## Demo Access

Use this demo account to try the hosted app quickly, or create your own account inside the product.

Live app:
[https://d2y37devywknxa.cloudfront.net/](https://d2y37devywknxa.cloudfront.net/)

- Email: `demo@gmail.com`
- Password: `Demo@123`

## Project Summary

Tesla Energy Planner is a React + TypeScript web application for modeling a utility-scale battery site layout.

The app is built to match the project requirements closely:

- users can configure the yard by adding battery modules
- the system calculates total `energy`, `cost`, and `land footprint`
- transformers are handled automatically from the project rule of `1 transformer for every 2 industrial batteries`
- the app generates a live visual site layout from the chosen configuration
- the site layout respects the `100ft` width requirement from the spec
- users can save and return to work later

## Requirement Alignment

### Core planner behavior

The planner supports the battery models defined in the project brief:

- `MegapackXL`
- `Megapack2`
- `Megapack`
- `PowerPack`

The app derives transformers automatically instead of asking the user to place them manually. This keeps the workflow simple while still enforcing the project rule.

### Live calculations

The UI updates these values as the yard changes:

- `Net energy`
- `Project cost`
- `Footprint`
- `Energy density`

### Generated layout

The central visualization is a generated yard scene, not a static mockup. As the user adds or removes modules:

- the yard rebalances automatically
- batteries and transformers update in the scene
- wires reroute to the active transformer positions
- the stage reflects the current configuration in real time

## Save And Persistence Design

The project requirement says users should be able to save and return later, even if browser cache is cleared. The app handles that with account-backed persistence instead of browser-only storage.

### How it works

- anonymous users can use the planner immediately
- signed-in users get a persistent autosaved workspace
- if the workspace has not been promoted to a named project yet, it is stored as a `draft`
- users can convert the active workspace into a named project at any time
- opening a saved project restores its latest state
- deleting a saved project removes it from the library, but keeps the current workspace open as a draft if that project was active

### Why this matches the requirement

This approach satisfies the save/resume requirement more reliably than `localStorage` because the saved data lives on the backend and is tied to the account, not to one browser cache.

## Product Flow

### Anonymous flow

- open the site
- configure the yard
- see live calculations and layout updates immediately
- sign in only when persistence is needed

### Signed-in flow

- sign in or create an account
- continue working from the current layout
- the workspace autosaves as a draft
- create a named project when you want it to appear in the project library
- reopen projects later from the saved project list

## Frontend Design

The interface is intentionally minimal and product-focused:

- a prominent top section with the main title, summary, and workspace controls
- live summary metrics
- a generated isometric yard scene
- battery controls for adding and removing modules
- saved project management for signed-in users

The animation and layout system are designed to make the yard feel like a real configured site rather than a form with numbers.

## Technical Design

### Frontend

- `React`
- `TypeScript`
- `Vite`
- `Framer Motion`

Key files:

- [App.tsx](/Users/nitin/Desktop/tesla/src/App.tsx): product flow, auth state, drafts, projects, autosave, project actions
- [StageScene.tsx](/Users/nitin/Desktop/tesla/src/StageScene.tsx): yard rendering and stage UI
- [planner.ts](/Users/nitin/Desktop/tesla/src/planner.ts): planning calculations and transformer logic
- [stage.ts](/Users/nitin/Desktop/tesla/src/stage.ts): scene geometry and wire routing

### Backend

- `Hono`
- `Node.js`
- account-backed persistence

The backend handles:

- signup and login
- session cookies
- project save and load
- draft autosave
- project deletion

## Local Development

Install dependencies:

```bash
npm install
```

Run the full app locally:

```bash
npm run dev
```

Local URLs:

- app: [http://localhost:8000](http://localhost:8000)
- API: `http://localhost:8787`

## Verification

Run:

```bash
npm run lint
npm run test -- --run
npm run build
```

The test suite covers:

- planner calculations
- transformer derivation
- stage geometry
- account flow
- autosave behavior
- project creation and deletion
- status stability

## Deployment

The project can be deployed with one command:

```bash
npm run deploy
```

This matches the project requirement that the solution should be runnable and deployable without a complicated multi-step manual setup.
