# DeployX — Project Overview

## What Is This?
A production-grade cloud-native CI/CD platform that automates the full application delivery lifecycle:
**code -> build -> test -> containerize -> deploy -> observe -> self-heal**

## Architecture
```
Control Plane (Vercel + Supabase)
  Next.js 16 App Router (Dashboard + API Routes)
  Supabase: Postgres, Auth, Realtime, Storage, Edge Functions
       |
       | HTTP poll (5s) + Realtime push
       v
Runner Agent (User's Machine)
  Node.js CLI (@deployx/runner)
  Job Poller -> Pipeline Executor -> Container Factory -> Deployer -> Health Monitor
       |
       | Docker API / Platform APIs
       v
Execution Targets (Pluggable)
  Docker Daemon (local) | Railway | Fly.io
```

## Tech Stack
- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 16.2.2 (App Router), React 19.2.4, Tailwind CSS v4.2.2
- **Backend**: Next.js API Routes (Vercel serverless)
- **Database**: Supabase PostgreSQL + RLS
- **Auth**: Supabase Auth (GitHub OAuth, PKCE flow)
- **Realtime**: Supabase Realtime (postgres_changes)
- **Runner CLI**: Node.js + commander + execa
- **Validation**: Zod (shared schemas)
- **DAG Viz**: @xyflow/react + dagre (Phase 6)
- **Charts**: recharts (Phase 6)

## Supabase Project
- URL: https://hrnjmwnbidotpqqtmtxw.supabase.co
- GitHub OAuth: Enabled
- Redirect URLs:
  - Local: `http://localhost:3000/auth/callback`
  - Production: `https://deployx-chi.vercel.app/auth/callback`

## Monorepo Structure
```
deployx/
  apps/web/          # Next.js dashboard (Vercel)
  apps/runner/       # Node.js CLI agent (npm package)
  packages/shared/   # Types, constants, Zod validators
  packages/pipeline-engine/  # State machine, DAG resolver, YAML parser
  supabase/          # Migrations, edge functions, seed
  docs/              # Context docs (this directory)
```

## Design Tokens (Material Design 3 Dark)
- Surface: #0b1326
- Primary: #adc6ff
- Tertiary/Success: #4ae176
- Error: #ffb4ab
- Fonts: Inter (body) + JetBrains Mono (code)
- Icons: Material Symbols Outlined
