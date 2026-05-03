# Hidden Superuser Admin Panel (`/dominator`)

## Environment Variables

Set in backend environment:

- `SUPERUSER_EMAIL` - exact superuser email (must match authenticated user email)
- `SUPERUSER_PASSWORD_HASH` - bcrypt hash for superuser re-authentication
- `ADMIN_ACCESS_SECRET` - long random signing secret for hidden activation tokens

## What Was Implemented

### Backend

- Added concealed dominator module with dedicated services and route layer:
  - `AdminAuthService`
  - `AdminMetricsService`
  - `AdminUserService`
  - `AdminAuditService`
- Added hidden activation flow:
  - `POST /dominator/access/ignite`
  - `POST /dominator/access/consume`
- Added superuser re-login + isolated admin session:
  - `POST /dominator/session`
  - `GET /dominator/session/me`
  - `DELETE /dominator/session`
- Added secure panel APIs:
  - `GET /dominator/overview`
  - `GET /dominator/users`
  - `GET /dominator/users/:userId`
  - `GET /dominator/users/:userId/files`
  - `DELETE /dominator/files/:mediaId`
  - `DELETE /dominator/users/:userId`
  - `GET /dominator/live-activity`
  - `GET /dominator/audit-logs`
- Added concealed auth middleware:
  - `requireDominatorAuth` returns 404 for auth failure
  - `requireAdminSession` returns 404 for admin session failure
- Added audit logging for failed/invalid/suspicious attempts.
- Added strict admin cookie usage (`lf_admin_session`, httpOnly, sameSite strict, secure in production).
- Added CSRF coverage for admin cookie by including it in cookie-auth detection.

### Database

- Added models:
  - `AdminAccessToken`
  - `AdminSession`
  - `AdminAuditLog`
- Added migration SQL:
  - `apps/backend/prisma/migrations/20260503143000_hidden_dominator_superuser/migration.sql`

### Frontend

- Hidden key activation listener (`CTRL + ALT + SHIFT + D`) implemented in:
  - home page
  - account page
- No visible navigation links/buttons to dominator panel.
- Added guarded route:
  - `apps/frontend/src/app/dominator/page.tsx`
  - Server-side gate behavior:
    - active admin session check, else token consume, else 404 via `notFound()`
- Added internal dominator operational UI:
  - `apps/frontend/src/app/dominator/dominator-client.tsx`
- Added API client functions for hidden activation, session, metrics, users, files, live activity, and audit logs.

## Security Behavior

- `/dominator` does not grant access by direct typing/refresh/copy URL unless:
  - superuser-authenticated user context
  - valid unexpired hidden activation token flow
  - or existing valid admin session cookie
- Token protections:
  - signed
  - short-lived (30s)
  - includes jti
  - single-use via DB state
- Admin login protections:
  - email equality to `SUPERUSER_EMAIL`
  - password verify against `SUPERUSER_PASSWORD_HASH`
  - challenge token required
  - brute-force control with login failure counting + rate limit (5/15 min)
- Unauthorized and failed dominator auth paths return 404.

## Threat Model Summary

Primary threats addressed:

1. **Route discovery**
   - No navigation links or UI references.
   - Hidden keyboard-triggered access initiation.
   - 404 responses for unauthorized paths.

2. **Token forgery/replay**
   - Signed activation tokens with secret.
   - jti recorded server-side.
   - One-time consume semantics.
   - Expiry enforced.

3. **Session hijack / auth confusion**
   - Separate admin session cookie (`lf_admin_session`).
   - Strict cookie settings and expiry.
   - Additional superuser re-authentication required.

4. **Brute-force superuser login**
   - Route-level rate limiting.
   - Failed-attempt counting window.
   - Audit logging.

5. **Privilege abuse / audit blind spots**
   - Audit entries for failed access, login failures, and destructive actions.

## Deployment Notes

1. **Set secure values in production**
   - Use a strong random `ADMIN_ACCESS_SECRET`.
   - Use a strong bcrypt hash in `SUPERUSER_PASSWORD_HASH`.

2. **Apply schema changes**
   - Migration files are added.
   - Current environment reported Prisma baseline mismatch (`P3005`) for `migrate deploy`.
   - Baseline or adopt migration strategy for existing production DB before deploy.

3. **Regenerate Prisma client**
   - Run `pnpm --filter @linkforge/backend prisma:generate` in deployment pipeline.

4. **Validate startup env**
   - Confirm `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD_HASH`, and `ADMIN_ACCESS_SECRET` are present and correct.

5. **Post-deploy verification**
   - Ensure `/dominator` returns 404 without hidden activation/session.
   - Verify activation shortcut works only on home/account while authenticated as superuser.

## Validation Results

- Backend typecheck: passed
- Frontend typecheck: passed
- Backend tests: passed (including dominator auth service tests)
