# EcoLens Vision

EcoLens Vision is a Next.js app for AI-powered waste sorting. It supports Taiwan and Japan rules, image upload, live camera capture, feedback submission, and Supabase-backed storage for review data.

## Features

- Taiwan / Japan region switching
- Image upload classification
- Live camera classification
- Multi-part waste breakdown
- Error feedback with SSE updates
- Rate limiting, structured logs, and a production checklist

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Vercel
- Supabase
- Gemini API

## Project Structure

```text
app/        Next.js pages and API routes
lib/        classification, feedback, rules, and rate limit utilities
public/     test images and static assets
scripts/    smoke test and feedback review tools
supabase/   database schema
docs/       deployment and product docs
```

## Development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Open `http://localhost:3000`

## Environment Variables

For local development, you only need the values you plan to use. If `GEMINI_API_KEY` is missing, the classification API falls back to the mock provider.

```bash
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
E2E_BASE_URL=http://localhost:3000
```

`.env.example` contains the same keys in sample form.

## Scripts

```bash
npm run dev         # development mode
npm run build       # production build
npm run start       # start production server
npm run lint        # TypeScript check
npm test            # unit tests
npm run test:smoke  # browser/API smoke test
npm run review-feedback
npm run rule-override
```

## Database

Before production deployment, run `supabase/schema.sql` to create the feedback tables and storage bucket settings.

## Deployment

Recommended flow:

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Set the production environment variables.
4. Run `npm run test:smoke` after deployment.

See `docs/production-checklist.md` for the full checklist.

## Test Images

`public/test-images/` contains the test assets. Source and license notes are documented in `public/test-images/README.md`.
