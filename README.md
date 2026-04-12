# EtherSend

EtherSend is a cloud-ready media and persistent-link control platform foundation.

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

## Notes

- OAuth code exchange and provider profile verification are implemented for Google and GitHub.
- Set `MAINTENANCE_API_KEY` (optional) to protect cleanup maintenance routes via `x-maintenance-key` header.
- Azure Blob adapter is intentionally stubbed for phase-2 cloud cutover.
- Cleanup queue + worker scaffold is implemented; recurring scheduling is the next increment.

## AWS Deployment (EC2)

This repo now includes production deployment assets:

- PM2 process config: `ecosystem.config.cjs`
- Nginx reverse-proxy template: `deploy/nginx/linkforge.conf`
- EC2 base setup script: `deploy/aws/setup_ec2_base.sh`
- EC2 deploy script: `deploy/aws/deploy_ec2.sh`
- Strict migration bootstrap: `deploy/aws/bootstrap_migrations.sh`
- Docker production files:
   - `Dockerfile.backend`
   - `Dockerfile.frontend`
   - `docker-compose.prod.yml`
- systemd units and installer:
   - `deploy/systemd/linkforge-backend.service`
   - `deploy/systemd/linkforge-frontend.service`
   - `deploy/systemd/install_units.sh`

### Quick Flow

1. Provision Ubuntu EC2 and open security group ports 22/80/443.
2. Run base setup on EC2:
   - `bash deploy/aws/setup_ec2_base.sh`
3. Set production values in:
   - `.env`
   - `apps/backend/.env`
   - `apps/frontend/.env.local`
   - Required for single-host no-port access:
     - `apps/frontend/.env.local` -> `NEXT_PUBLIC_API_BASE_URL=/api`
     - `apps/backend/.env` -> `FRONTEND_BASE_URL=https://your-domain.com` (or `http://YOUR_SERVER_IP`)
     - `apps/backend/.env` -> `OAUTH_CALLBACK_BASE_URL=https://your-domain.com/api` (or `http://YOUR_SERVER_IP/api`)
   - OAuth provider callback URIs must include `/api`:
     - `https://your-domain.com/api/auth/google/callback`
     - `https://your-domain.com/api/auth/github/callback`
4. Deploy apps:
   - `bash deploy/aws/deploy_ec2.sh`
5. Install Nginx template:
   - copy `deploy/nginx/linkforge.conf` to `/etc/nginx/sites-available/linkforge.conf`
   - keep `server_name _;` for direct IP access, or set your domain name
   - enable site and reload nginx

After Nginx is enabled, users should access LinkForge at `http://YOUR_SERVER_IP` or `https://your-domain.com` without app/backend ports.

### Optional: Docker Compose Production

If you prefer containerized runtime for app services:

- `docker compose -f docker-compose.prod.yml up -d --build`

### Optional: systemd Instead of PM2

Install units (run as root):

- `bash deploy/systemd/install_units.sh --repo-dir=/opt/linkforge --user=ubuntu`

### Important

- Current media storage provider is local filesystem (`apps/backend/storage`).
- For single-instance EC2 this works with EBS persistence.
- For multi-instance scaling, implement an S3-backed storage provider and switch routes/services to use provider injection.
