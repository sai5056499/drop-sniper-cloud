# ⚡ Drop-Sniper Cloud (`sai5056499/drop-sniper-cloud`)

Zero-local-storage, 24/7 cloud ticket booking platform for **IRCTC Tatkal**, **TTD ₹300 Special Entry Darshan**, **IPL Tickets**, and **BookMyShow** — runs even when your computer is completely off.

## Architecture
- **Vercel Web Console & Serverless API (`/api/*`, `public/index.html`)**: Mobile-first control center, AES-256-GCM Encrypted Cloud Passenger Vault, real-time OTP/Captcha bridge, and Vercel Cron trigger.
- **GitHub Actions 24/7 Playwright Worker (`.github/workflows/drop-worker.yml`)**: Spins up a cloud Ubuntu + Chromium worker at `09:58 AM IST` / `10:58 AM IST` (or on-demand via `workflow_dispatch`) so your laptop never needs to be on.
