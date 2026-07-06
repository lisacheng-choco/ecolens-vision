# Classification golden dataset

`evals/golden.json` is the versioned evaluation manifest. The current cases are a seed that proves the harness; they are not large enough to select or release a classification method.

## Review requirements

- Use licensed, non-private images and record their source in `public/test-images/README.md`.
- Have a domain reviewer confirm every destination against an official source.
- Express acceptable semantics, required destinations, and forbidden destinations instead of exact generated prose.
- Never promote feedback directly. Reproduce it, verify it, then add a reviewed case.
- Keep the `test` split frozen. Prompt and rule changes may use only `dev` results.

## Target coverage

- Vision: at least 40 images across known rules, open-vocabulary items, multiple objects, mixed materials, and hazards.
- Policy: at least 60 reviewed item/location cases, including municipality conflicts and contamination conditions.
- End-to-end: at least 30 representative image/location cases.

Release gates are zero hazardous false-safe results, zero unsupported assertive answers, zero invalid evidence, and zero municipality leakage. Compare item recall, destination accuracy, unresolved coverage, latency, and model calls only after those gates pass.

## Eval runtime constraint

For this repo's eval runs, assume Gemini Free Tier can hit a practical ceiling of 5 requests per minute per project. Treat `429` or quota-exhausted responses as a rate-limit event, do not loop-retry inside the same minute, and continue with the next case after cooldown.

## Adding a case

Add the image under `public/test-images`, document its license, and append a manifest entry:

```json
{
  "id": "unique-case-id",
  "split": "dev",
  "image": "public/test-images/example.jpg",
  "regionHint": "tw",
  "municipality": "taipei",
  "locale": "zh-TW",
  "expectedItems": [{
    "ruleKey": "battery",
    "requiredDestinations": ["special_collection"],
    "forbiddenDestinations": ["general"]
  }]
}
```

Run `npm run eval -- --split dev --output /tmp/dev-eval.json` against a running app. This writes both `/tmp/dev-eval.json` and `/tmp/dev-eval.md`. Save reports outside the repository unless a reviewed benchmark snapshot is intentionally being committed.
