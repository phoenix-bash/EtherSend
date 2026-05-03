# EtherSend

EtherSend is a secure media and link-control platform where users upload files, preview content, create controlled shares, and manage lifecycle actions like expiry, disable, and burn/vanish behavior from a unified dashboard.

## Stack

- Frontend: Next.js 15 + React 19 + TypeScript + Tailwind CSS + Framer Motion
- Backend: Fastify + TypeScript + Zod
- Database/ORM: PostgreSQL + Prisma
- Cache/Queues: Redis + BullMQ
- Storage: Local provider + S3-compatible v2 upload pipeline
- File previewing: docx-preview (DOCX), xlsx (XLSX), and backend slide/page rasterization via LibreOffice/soffice + pdftoppm (PPTX/PDF image previews)


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

## Local HTTPS (Self-Signed)

To run EtherSend behind local TLS with a self-signed certificate:

1. Start the project (HTTP app services on ports 3000/4000):
   - `bash start_project.sh`
2. Start local TLS proxy (generates cert if missing):
   - `bash deploy/nginx/start_local_https.sh`
3. Open:
   - `https://localhost`

Generated certificate files:

- `deploy/nginx/certs/linkforge.local.crt`
- `deploy/nginx/certs/linkforge.local.key`

Stop only the TLS proxy:

- `bash deploy/nginx/stop_local_https.sh`

