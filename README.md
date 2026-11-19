# CARTO Store

A responsive clothing and shoes store with cart, checkout, PostgreSQL orders, customer tracking, admin dashboard, and email notifications.

## Deploy with GitHub + Railway (Android-friendly)

1. Create a GitHub repository named `carto-store`.
2. Upload **all files and folders** in this project to the repository (keep `public` as a folder).
3. In Railway, create a new project → Deploy from GitHub Repo → choose `carto-store`.
4. In the Railway project, add a **PostgreSQL** database service.
5. Open the app service → Variables and add the variables below. Railway's PostgreSQL service normally provides `DATABASE_URL`; reference the database service's `DATABASE_URL` if it is not automatically available.
6. Redeploy. Open the generated public domain.

## Required Railway variables

- `DATABASE_URL` — reference the Railway PostgreSQL `DATABASE_URL`.
- `SESSION_SECRET` — a long random secret.
- `ADMIN_EMAIL` — your admin login email.
- `ADMIN_PASSWORD` — choose a strong, unique admin password.

## Email notifications (Gmail SMTP)

For Gmail, enable 2-Step Verification on the Google account and create a Google **App Password**. Do not use your normal Gmail password. Add:

- `SMTP_HOST` = `smtp.gmail.com`
- `SMTP_PORT` = `465`
- `SMTP_SECURE` = `true`
- `SMTP_USER` = your Gmail address
- `SMTP_PASS` = your 16-character Google App Password
- `ADMIN_EMAIL` = the Gmail address that receives new-order alerts
- `MAIL_FROM` = your Gmail address

The store emails the admin when a new order is placed, emails the customer a receipt, and emails the customer when an admin updates order status. Email delivery requires valid SMTP variables.

## Admin

Visit `/admin` on your deployed site. Sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Admin can review orders, confirm/update status, add courier tracking numbers, and add/delete products, and upload product photos from a phone (up to 5 MB). The `/admin`, `/admin/`, and `/admin/login` routes open the admin page directly.

## Important before accepting real orders

- This starter offers Cash on Delivery and a UPI/manual option; it does **not** collect online payments. Integrate a payment gateway (such as Razorpay) before advertising online payment.
- Order tracking currently shows the store's status updates; courier live GPS tracking is not included. Add a courier integration for carrier scans.
- Replace sample products, prices, and image URLs with your own inventory and confirm you have rights to use each image.
- Add shipping, returns, privacy, and terms pages; test checkout, email, admin access, stock, and tracking before launch.
- Keep all secrets in Railway Variables. Never commit passwords or Gmail App Passwords to GitHub.
- Set a strong `SESSION_SECRET` and `ADMIN_PASSWORD`. Restrict repository access if you prefer private source code.
