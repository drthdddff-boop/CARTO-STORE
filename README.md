# CARTO stateless Admin authentication fix

Replace these two files in your GitHub repository:
- `server.js`
- `public/admin.js`

This change uses a signed, expiring bearer token for Admin API requests rather than Express session cookies, which may not persist between Vercel serverless invocations. It still requires `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a stable `SESSION_SECRET` in Vercel. Database-backed product and order features still require `DATABASE_URL`.

After replacing both files, commit and redeploy. Then visit `/admin`, sign in again, and test adding a product.
