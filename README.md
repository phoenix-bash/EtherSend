# LinkForge

LinkForge is a cloud-ready media and persistent-link control platform foundation.

## Stack

- Backend: Fastify + TypeScript + Prisma + PostgreSQL
- Frontend: Next.js + Tailwind + Framer Motion
- Storage: Provider abstraction with local adapter and Azure Blob stub
- Cache/Queue readiness: Redis + BullMQ-ready architecture

## Current Implementation Scope

- OAuth-only auth API surface (Google/GitHub provider model, verified-email policy)
- Guest uploader lifecycle model with signed guest session and 30-minute TTL rules
- Media upload/list/replace/serve routes
- Image-link creation/renew + direct serving route `/i/{id}.{ext}`
- QR token creation + resolve route `/q/{token}` with bounded TTL policy
- OAuth start/callback and token exchange routes:
   - `GET /auth/google/start`, `GET /auth/google/callback`
   - `GET /auth/github/start`, `GET /auth/github/callback`
   - `POST /auth/oauth/:provider` for access-token or code exchange
   - `POST /auth/refresh`, `POST /auth/logout`
- Expired guest media cleanup execution paths:
   - `POST /internal/cleanup/expired/run`
   - `POST /internal/cleanup/expired/enqueue`
   - Worker entrypoint script: `pnpm --filter @linkforge/backend worker:cleanup`
- Dashboard shell for Overview, Image Manager, Media Manager, QR Generator

## Workspace Structure

- `apps/backend`: API server and domain modules
- `apps/frontend`: Next.js dashboard
- `packages/shared`: shared DTO/contracts

## Local Setup

1. Copy env templates:
   - root: `.env.example` -> `.env`
   - backend: `apps/backend/.env.example` -> `apps/backend/.env`
   - frontend: `apps/frontend/.env.example` -> `apps/frontend/.env.local`
2. Start dependencies:
   - `docker compose up -d`
3. Install dependencies:
   - `pnpm install`
4. Generate Prisma client and migrate:
   - `pnpm --filter @linkforge/backend prisma:generate`
   - `pnpm --filter @linkforge/backend prisma:migrate`
5. Run apps:
   - `pnpm dev`
6. Optional: run cleanup worker:
   - `pnpm --filter @linkforge/backend worker:cleanup`

## Notes

- OAuth code exchange and provider profile verification are implemented for Google and GitHub.
- Set `MAINTENANCE_API_KEY` (optional) to protect cleanup maintenance routes via `x-maintenance-key` header.
- Azure Blob adapter is intentionally stubbed for phase-2 cloud cutover.
- Cleanup queue + worker scaffold is implemented; recurring scheduling is the next increment.
