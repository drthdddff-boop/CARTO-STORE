# CARTO — Vercel-ready Express adaptation

This project is adapted to run as a Vercel Node serverless function. Storefront and admin pages are served through Express. API routes are routed to `api/index.js`.

## Vercel environment variables required
- `DATABASE_URL`: PostgreSQL connection string (use a hosted Postgres provider such as Neon; ensure provider connection string is compatible with serverless).
- `ADMIN_EMAIL`: admin email address.
- `ADMIN_PASSWORD`: strong admin password.
- `SESSION_SECRET`: long random secret (32+ characters).
- Optional mail variables: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`false`), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.

Set variables for Production (and Preview if needed), then redeploy. DB tables and admin credentials are initialized on first request when `DATABASE_URL` is present.

## Deployment
1. Upload/replace these project files in the existing GitHub repo.
2. Import or keep the repo linked in Vercel.
3. Add environment variables listed above.
4. Deploy.
5. Visit `/admin`.

**Important:** This is an Express-to-Vercel adaptation, but database, session, image storage, and email still depend on valid environment configuration and external provider availability. Product images submitted as base64 are stored in the database in this prototype. Large images may exceed request limits; compress photos before uploading.
