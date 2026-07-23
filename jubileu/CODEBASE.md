# 📐 Codebase Architecture

> Quick reference for working with The Normal Elevator codebase.

## Directory Structure

```
jubileu/
├── src/
│   ├── main.tsx            # Entry point — renders <App/>
│   ├── App.tsx             # Main orchestrator (keep clean!)
│   ├── constants.ts        # All URLs, colors, config, dialogue trees
│   ├── physics.ts          # Collision detection (circle vs line segments)
│   │
│   ├── hooks/              # Custom React hooks
│   │   └── useGameState.ts # Central game state machine
│   │
│   ├── components/         # Extracted UI components
│   │   └── GameHUD.tsx     # ElevatorPanel, FloorReveal, StatusBanner, etc.
│   │
│   ├── Player.tsx          # Local player avatar + camera system
│   ├── RemotePlayer.tsx    # Remote MP player avatar
│   ├── Multiplayer.tsx     # Firebase Firestore sync
│   ├── Bot.tsx             # Autonomous bot system (steering behaviors)
│   │
│   ├── Elevator.tsx        # Elevator interior + doors
│   ├── LobbyEnv.tsx        # Lobby environment (20x20 room)
│   ├── HouseEnv.tsx        # House exterior + interior + Barney actor
│   ├── Furniture.tsx       # Sofa, bed, table, counter, barrel
│   ├── BuildingBlocks.tsx  # Reusable: door, wall, light, plant, etc.
│   ├── Materials.tsx       # TextureMaterial wrapper
│   │
│   ├── MainMenu.tsx        # Start screen with door animation
│   ├── Settings.tsx        # Settings menu + quality profiles
│   ├── UI.tsx              # Joystick, typewriter text, dialogue overlay
│   ├── AudioEngine.tsx     # Procedural Web Audio (lobby + Barney theme)
│   │
│   ├── index.css           # Global styles, HUD system, animations
│   └── __tests__/          # Vitest test files
│
├── audit.mjs               # Codebase health check
├── bug-hunter.mjs           # Bug pattern detection
├── inline-build.mjs         # Generates single-file index.html
├── vite.config.ts           # Vite config
├── vitest.config.ts         # Test config
├── eslint.config.mjs        # Linting rules
└── CODEBASE.md              # This file
```

## File Size Guidelines

| File | Target | Max |
|------|--------|-----|
| Components | < 200 lines | 300 |
| Hooks | < 100 lines | 150 |
| Utils/physics | < 50 lines | 100 |
| App.tsx | < 400 lines | 500 |

**If a file exceeds max:** extract into hooks/, components/, or utils/.

## How to Add a Feature

1. **New UI element?** → Add to `components/GameHUD.tsx` or create new file in `components/`
2. **New game mechanic?** → Add state to `hooks/useGameState.ts`, logic in `App.tsx`
3. **New bot behavior?** → Add to `Bot.tsx` (type + case in switch + API command)
4. **New environment?** → Create `NewEnv.tsx`, import in `App.tsx`
5. **New dialogue?** → Add to `constants.ts` DIALOGUE_TREE or BARNEY_DIALOGUE

## How to Fix a Bug

1. Run `node bug-hunter.mjs` to find patterns
2. Run `node audit.mjs` to check structure
3. Fix in source file (NOT in index.html)
4. Run `npm run build && node inline-build.mjs` to rebuild
5. Test the single-file `index.html`

## Build Pipeline

```
Source files → Vite build → dist/ → inline-build.mjs → index.html (single-file)
```

- `npm run dev` — dev server with HMR
- `npm run build` — production build to dist/
- `node inline-build.mjs` — generates ../index.html (single-file)
- `npm run check` — types + tests + audit

## Key Patterns

### Game State Machine
```
lobby → outdoor → barney_greet → indoor_day → sleep_fade → indoor_night → chase → caught/saved
```

### Collision System
All entities (player, bots) use `resolveCollision()` from `physics.ts`.
Walls are 4-tuples `[x1, z1, x2, z2]` defined in `constants.ts`.

### Multiplayer
Firebase Auth (anonymous) → Firestore `worlds/main/players/{uid}`
Position synced every 100ms. Ghost players (>10s stale) filtered.

### Audio
Procedural Web Audio — no external audio files.
Lobby music loaded from GitHub. Barney theme from archive.org.

## Common Pitfalls

- **Don't edit index.html** — it's a build output, edit source files
- **Don't hardcode safe-area** — the `.hud-fixed` wrapper handles it once
- **Don't add `key` to Canvas** — causes GLB reload on every settings change
- **Don't use `console.log` in production** — use `console.warn/error` only
- **Don't forget cleanup** — useEffect with timers must return cleanup

## Testing

```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run audit         # Structure check
node bug-hunter.mjs   # Bug patterns
npm run check         # All checks
```
