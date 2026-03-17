# Gym Athlete Management App

A full-stack athlete management application with:

- a mobile-first athlete experience
- a desktop dashboard for coaches and owners
- Express + Prisma backend
- SQLite for local development
- JWT authentication for coaches and athletes

## Stack

- Frontend: React, React Router
- Backend: Node.js, Express
- ORM: Prisma
- Database: SQLite locally (`server/prisma/dev.db`)
- Auth: JWT

## Project Structure

```text
client/   React application
server/   Express API + Prisma
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp server/.env.example server/.env
```

3. Generate the Prisma client and create the local database:

```bash
npm run prisma:generate
npm run prisma:push
```

If `prisma db push` ever fails in a restricted environment, use the local SQLite bootstrap instead:

```bash
npm run db:init -w server
```

4. Seed sample data:

```bash
npm run seed
```

5. Start both apps:

```bash
npm run dev
```

Client runs at [http://localhost:5173](http://localhost:5173) and API runs at [http://localhost:4000](http://localhost:4000).

## Production Deployment

This app is set up to deploy as a single Node service that serves both:

- the React frontend
- the Express API

That means coaches and athletes can use the same public URL, and the app will route them to the correct experience after login.

### Recommended deployment

Use [Render](https://render.com/) with the included [render.yaml](/Users/davidhyde/Documents/Lift%20App/render.yaml#L1).

What the deploy does:

- builds the React frontend
- serves the built frontend from Express in production
- keeps the SQLite database on a persistent Render disk
- runs Prisma schema push on startup so the database stays in sync
- safely ensures the owner account exists on startup without wiping live data

### Render steps

1. Push this project to GitHub.
2. In Render, create a new Blueprint deploy from the repo.
3. Render will pick up `render.yaml`.
4. Set `CLIENT_URL` to your public app URL once Render gives you the domain.
   Example: `https://your-app.onrender.com`
5. After the first deploy finishes, open the live URL and sign in.

### Production owner bootstrap

Render startup now ensures the owner account exists using these env vars:

- `OWNER_NAME`
- `OWNER_EMAIL`
- `OWNER_PASSWORD`

Default production owner credentials:

- `owner@gym.com`
- `changeme123`

You should sign in once deployed and change that password immediately from your own operational process.

### Production start behavior

The root build/start commands are:

```bash
npm run build
npm run start
```

In production, Express serves the built files from `client/dist`, so there is no separate frontend host required.

### Getting the app on athlete phones

The easiest path is:

1. deploy the app
2. send athletes the live URL
3. have them sign in from Safari or Chrome on their phones
4. optionally use the browser's "Add to Home Screen" feature

That gives them a home-screen shortcut without needing the App Store.

## Dashboard Paths

- Owner and coach dashboard: `/dashboard`
- Owner-only staff management: `/dashboard/staff`

## Sample Logins

- Owner: `owner@gym.com` / `changeme123`
- Coach: `coach@liftlab.com` / `password123`
- Athlete: `mia@liftlab.com` / `password123`
- Athlete: `jordan@liftlab.com` / `password123`
- Athlete: `ava@liftlab.com` / `password123`

## Coach Creation Script

Create a coach from the command line:

```bash
node scripts/createCoach.js "Coach Name" "email@gym.com" "password123"
```

## Environment Variables

Set these in `server/.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `HOST`
- `CLIENT_URL`

## API Summary

Auth:

- `POST /api/auth/login`

Coach routes:

- `GET /api/athletes`
- `GET /api/athletes/:id`
- `PUT /api/athletes/:id`
- `POST /api/athletes/:id/lifts`
- `PUT /api/athletes/:id/lifts/:liftId`
- `DELETE /api/athletes/:id/lifts/:liftId`
- `GET /api/athletes/:id/lifts?week=YYYY-MM-DD`
- `POST /api/athletes/:id/apply-program`
- `POST /api/athletes/:id/rehab`
- `GET /api/athletes/:id/rehab`
- `GET /api/program-library`
- `POST /api/program-library/import`

Owner staff routes:

- `GET /api/staff`
- `POST /api/staff`
- `PUT /api/staff/:id/deactivate`
- `PUT /api/staff/:id/reactivate`
- `PUT /api/staff/:id/reset-password`

Athlete self routes:

- `GET /api/me/profile`
- `GET /api/me/lifts?week=YYYY-MM-DD`
- `PUT /api/me/lifts/:liftId`

## Notes

- The athlete app is optimized for `390px` width and uses an Apple-inspired visual system.
- The dashboard is optimized for larger desktop screens and includes athlete, programming, rehab, AMIT, and owner-only staff workflows.
- Weekly programming supports an importable lift library and program templates keyed off `phase + program type + days per week`.
- The `10-Week` and `20-Week` training models control phase duration only: `2 weeks` or `4 weeks` in each phase across `Prep -> Eccentrics -> Iso -> Power -> Speed`.
- `Program type` stays `Standard` for every phase except `Eccentrics`, which supports `Alactic Eccentrics` and `Lactic Eccentrics`.
