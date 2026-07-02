# EcoLens production checklist

## Before deployment

- Run `npm test`, `npm run lint`, and `npm run build`.
- Set `GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production only.
- Run `supabase/schema.sql` and confirm `feedback` has RLS enabled.
- Confirm the `feedback-images` bucket is private. No browser role receives a Storage policy.
- Keep `.env` and the Supabase service role key out of Git and client bundles.

## Deploy and verify

- Deploy from the intended commit, then run `E2E_BASE_URL=https://your-domain npm run test:smoke`.
- Verify HTTPS, camera, geolocation, upload, feedback, SSE, Taiwan rules, and Japan rules.
- Verify response headers include `X-Frame-Options`, `X-Content-Type-Options`, and `Permissions-Policy`.
- Verify Vercel logs contain `classification.completed`, `classification.fallback`, and `feedback.completed` events without image data or secrets.

## Cost and failure controls

- Set Gemini project quota and billing alerts in Google Cloud; application logs cannot replace provider-side budget alerts.
- Classification is limited to 20 requests per client per minute; feedback to 10; SSE to 30.
- Confirm Gemini failure returns a mock result with `model.provider: "mock"` instead of a blank error.
- Review provider and fallback counts in Vercel logs after each release.

## Privacy and rollback

- Uploaded images are not persisted. The private Storage bucket is reserved for a future explicit opt-in feedback flow.
- Confirm logs contain request IDs and metadata only, never base64 images, API keys, or full provider responses.
- Keep the previous Vercel deployment available for instant rollback.
