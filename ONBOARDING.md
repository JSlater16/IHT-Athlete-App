# IHT Athlete App — Onboarding for a new chat

This file is a handoff for any new Claude Code conversation that picks
up work on this repo. Read top-to-bottom once before touching anything.

## TL;DR

- **Project**: athlete management web app for IHT Human Performance (coach/owner: David Slater). Coaches build programs, assign them to athletes, review ForceDecks performance data, run leaderboards.
- **Stack**: React + Vite (PWA + Capacitor iOS) on the client, Node + Express + Prisma + Postgres on the server. Deployed to Render.
- **Active branch**: `capacitor-setup` (this is what Render deploys; `main` is behind). Default-branch behavior in this repo is unusual — read git remote + render.yaml before assuming.
- **User**: blunt strength/performance coach. Direct communication, no hedging, no soft athlete-feelings caveats. Trust his judgment on sports-science decisions; explain technical tradeoffs concisely.
- **Memory**: persistent notes in `/Users/iht/.claude/projects/-Users-iht-Downloads-Lift-App/memory/`. Read `MEMORY.md` first; it indexes user preferences, project context, and active integrations.

## Repo layout

```
client/                 React + Vite SPA
  src/
    pages/
      athlete/          Athlete-facing pages (home, forcedecks, leaderboard, profile)
      coach/            Coach-facing pages (roster, workouts, athlete profile, leaderboards, FD)
    components/
      forcedecks/       ForceDecks dashboard, hex chart, trend chart, leaderboard, roster
      ConfirmModal.jsx
      Skeleton.jsx
    layouts/            AthleteLayout, CoachLayout (auth wrappers + tab/sidebar nav)
    lib/api.js          apiRequest helper — throws on non-2xx, handles 401 redirect
    context/AuthContext.jsx
    styles/             tokens, base, shared, athlete, coach, forcedecks, login
    utils/date.js       Week/day helpers used across both sides
server/
  prisma/
    schema.prisma       AthleteProfile, ForceDecksTest, ForceDecksMetric, Lift, AuditLog, User
    migrations/         Plain Postgres migrations
  data/
    programLibrary.json ~700KB tracked file. Holds programs[], liftLibrary[], miscWorkouts[].
  src/
    routes/             athleteRoutes, forcedecksRoutes, programLibraryRoutes, valdRoutes, authRoutes, staffRoutes, meRoutes, auditRoutes
    middleware/auth.js  requireAuth + role gates (Owner/Coach/Athlete)
    utils/              date, formatters, programLibrary, programVariant, audit, jwt, prisma, etc
    vald/               VALD External API integration: config, client, sync, cron, metrics
  scripts/
    bootstrapOwner.js
    valdSmoke.js          smoke-tests VALD auth + lists tenants
    dumpValdResultDefs.js refresh metric catalog
    seedForcedecksDemo.js demo seeder (--clean to wipe)
    importProgramCsv.js   one-off CSV importer for programs
render.yaml             Render service config, env var declarations
```

## Run / build / deploy

```bash
# Local dev (both client + server with hot reload)
npm run dev

# Build (used by Render at deploy time)
npm run build      # = prisma generate + client build + server build

# Server start (Render runtime)
npm run start

# Useful one-offs
npm run prisma:push                                 # = prisma migrate deploy
node server/scripts/valdSmoke.js                    # verify VALD auth + list tenants
node server/scripts/dumpValdResultDefs.js           # dump 500+ VALD result definitions
node server/scripts/seedForcedecksDemo.js --clean   # wipe demo FD data (externalId like demo-*)
```

**Render setup**: web service `iht-performance-app` plus a Postgres add-on. Build runs `npm install && npm run build`, start runs `npm run prisma:push && npm run bootstrap:owner -w server && npm run start`. Most env vars are declared in `render.yaml` with `sync: false` for secrets — those live only in the dashboard.

## Active integrations + state

- **VALD External API** — fully wired. Tenant ID `d05c0921-fc39-4d63-a706-0f69dc754103` (IHT Human Performance, region USE). `VALD_CLIENT_ID`/`VALD_CLIENT_SECRET` in Render env vars only. Nightly cron at 12:01 AM America/New_York syncs every athlete linked to a VALD profile. Manual sync button on the coach FD athlete page does a full-year re-pull. See `reference_vald_integration.md` in memory for details.
- **ForceDecks** — readiness, hex chart, leaderboard, per-metric trend modal. CMJ-only sync; 13 metrics mapped from VALD result definitions (jump_height stored in inches, countermovement_depth in cm). Aggregation is per-metric best across trials within a session.
- **Athlete leaderboard** — Jump Height / Peak Power, top 10 capped server-side. Coach view uses `?full=1` to bypass the cap with a Show-all toggle.
- **Capacitor iOS** — capacitor configured but not actively deployed; web PWA is the live channel.

## Recent session highlights (chronological, not all-time)

This is what's been touched recently; not exhaustive history.

- ForceDecks metric trend chart modal (line chart with custom hover tooltip + animation; commits ~`28ec637`, `1eb742f`)
- Top-10 leaderboard cap + coach Show-all (commit `8f2bedd`)
- Workouts page revamp: family cards, table-style builder, day/block view toggle, lift reorder, Misc one-off workouts section
- VALD daily sync at 12:01 AM EST (commit `e2a36fb`)
- Aggregation fix: per-metric best across trials, not best-jump-height trial's value (commit `9e94987`)
- Coach side: VALD profile picker on athlete profile with name-match suggestions
- IHT Developmental Base + Advanced programs imported into the program library under the strict schema (commit `0f206e4`). The schema was briefly relaxed for these but reverted — current shape requires integer sets/reps, fixed phase enum, Standard-only variant for non-Eccentrics.

## Gotchas

- **Service worker cache** — `vite-plugin-pwa` aggressively caches. After a deploy, the existing tab may serve the old bundle. Tell the user to hard-refresh (`Cmd+Shift+R`) or use incognito to confirm a deploy landed.
- **Render deploys from `capacitor-setup`**, not `main`. Pushing to main does not deploy. Confirm with the user before merging.
- **`programLibrary.json` is tracked**. Commits to it show massive diffs (~1500 lines for two programs). That's expected.
- **Athlete-facing sets/reps are Prisma `Int`** — string/range values like "8-12" or "30 sec" don't survive the apply-program → Prisma Lift handoff. Either store fully numeric in the library, or live with single-int output to the athlete. (We tried relaxing this; reverted.)
- **VALD profile linking is per-athlete via UUID**. No auto-match (we don't put athlete emails into VALD). Coach picks from the VALD profile picker on the athlete profile page.
- **PR field naming**: `valdProfileId` is unique. Re-linking the same profile to another athlete returns a clean 400.

## Communication / behavior reminders

(Summarized from memory — see the memory files for full context.)

- **Direct, blunt coaching tone.** Skip caveats about athlete feelings or motivation risk.
- **Default-on leaderboards.** Coach controls removal; never propose opt-in flows.
- **Trust the user's domain knowledge.** He's a strength/performance coach with pro-sports connections (NY Knicks SS staff). Don't explain RFD/CMJ/RSI-mod basics.
- **Always confirm before commit/push.** He explicitly says "commit and push" when he wants it. Never auto-commit.
- **No mock/placeholder data**, except where the legacy seeder is explicitly being used (`seedForcedecksDemo`).
- **Open question**: `impulse_momentum` VALD mapping is currently `CONCENTRIC_IMPULSE` (resultId 6553712) as a placeholder. User is going to confirm the right metric with NY Knicks staff. See `project_vald_impulse_momentum_pending.md`.

## Where to look for memory

- `MEMORY.md` — index. Always loaded into Claude's context.
- `feedback_*.md` — communication style + leaderboard visibility rules.
- `reference_vald_integration.md` — full VALD setup notes.
- `project_vald_impulse_momentum_pending.md` — open mapping question.
- `user_domain.md` — who the user is.

Read those before assuming anything about the codebase or the user's preferences.
