# EcoLens Vision

EcoLens Vision is a Next.js app for AI-powered waste sorting. It combines deterministic Taiwan/Japan rules with an optional, source-grounded knowledge fallback.

## Osaka POC

The `poc/osaka` branch defaults to Traditional Chinese guidance for Osaka City household waste. Gemini identifies controlled item types; reviewed Osaka City rules determine disposal instructions and provide source links. The POC does not cover business waste, private building collection, or collection schedules.

## Features

- Taiwan / Japan region switching
- Municipality-specific knowledge for covered Taiwan and Japan cities
- Image upload classification
- Live camera classification
- Multi-part waste breakdown
- Error feedback with SSE updates
- Golden dataset evaluation for safety, coverage, latency, and model calls
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
app/        Next.js UI and API routes
lib/        browser, classification, feedback, rules, and API utilities
knowledge/  source-grounded Taiwan and Japan disposal guides
evals/      versioned classification evaluation datasets
public/     static assets and evaluation images
scripts/    evaluation, smoke test, feedback review, and rule tools
supabase/   database schema
docs/       evaluation, deployment, and product documentation
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

`GEMINI_API_KEY` is required for classification. Knowledge fallback is disabled by default until its golden dataset has been reviewed and expanded.

```bash
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash
CLASSIFICATION_KNOWLEDGE_FALLBACK=false
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
npm run eval        # evaluate a running server against evals/golden.json
npm run review-feedback
npm run rule-override
```

Run baseline and candidate evaluations against separate running deployments:

```bash
npm run eval -- --label baseline --base-url http://localhost:3000 --output /tmp/baseline.json
npm run eval -- --label hybrid --base-url https://staging.example.com --output /tmp/hybrid.json
```

Each `--output <name>.json` also writes `<name>.md`. Use `--markdown-output <path>` to choose a different Markdown path.
An existing JSON report can be converted without calling the model: `npm run eval -- --from-json /tmp/baseline.json`.
For Gemini Free Tier evals, keep batches under 5 requests per minute per project or expect `429` rate-limit failures; do not loop-retry those within the same minute.

The checked-in dataset is intentionally marked `seed`, not release-ready. See `docs/golden-dataset.md`.

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
