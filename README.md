# Vehicle Inspection Dashboard (PWA)

A standalone, installable Progressive Web App that mirrors the monday.com
Vehicle Inspection Dashboard: weekly submission compliance and flagged
issues, broken down by branch.

## How it works

- `app/api/dashboard/route.ts` is a server-side API route that queries the
  monday.com GraphQL API directly using a `MONDAY_API_TOKEN` environment
  variable (never exposed to the browser) and computes per-branch
  submission / issue stats from the **Vehicle Inspection Compliance** board
  (board ID `18418816965`).
- `app/page.tsx` is the dashboard UI: summary stat cards, a per-branch
  submitted/not-submitted bar breakdown, and an expandable/filterable list
  of employees (All / Not Submitted / Issues Flagged).
- `public/manifest.webmanifest` + `public/sw.js` make the app installable
  (Add to Home Screen / Install App) with basic offline asset caching. API
  calls always go to the network so data stays live.

## Local development

```bash
npm install
MONDAY_API_TOKEN="your-monday-api-token" npm run dev
```

Visit http://localhost:3000

## Deployment (Vercel)

1. Set the `MONDAY_API_TOKEN` environment variable in the Vercel project
   settings (Production + Preview).
2. Deploy. Vercel auto-detects Next.js.

## Updating which boards/columns are tracked

Edit the constants at the top of `app/api/dashboard/route.ts`:
- `BOARD_ID` — the monday.com board ID
- `COLUMN_IDS` — the column IDs pulled per item (Branch, Manager, Last
  Inspection Date, Submitted This Week, Issue Flagged)
