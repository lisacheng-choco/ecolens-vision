import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = new Map(process.argv.slice(2).map((arg, index, all) => (
  arg.startsWith("--") ? [arg, all[index + 1]?.startsWith("--") ? "" : all[index + 1]] : [arg, ""]
)));
const baseUrl = (args.get("--base-url") || process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const split = args.get("--split") || "all";
const output = args.get("--output");
const markdownOutput = args.get("--markdown-output") || (output
  ? `${output.replace(/\.json$/i, "")}.md`
  : undefined);
const fromJson = args.get("--from-json");
const label = args.get("--label") || "candidate";

if (fromJson) {
  const savedReport = JSON.parse(fs.readFileSync(fromJson, "utf8"));
  const destination = markdownOutput || `${fromJson.replace(/\.json$/i, "")}.md`;
  fs.writeFileSync(destination, renderMarkdown(savedReport));
  process.stdout.write(`${destination}\n`);
  process.exit(0);
}

const golden = JSON.parse(fs.readFileSync("evals/golden.json", "utf8"));
const cases = golden.cases.filter((item) => split === "all" || item.split === split);
assert.ok(cases.length > 0, `No golden cases for split: ${split}`);

const caseResults = [];
for (const goldenCase of cases) {
  const startedAt = performance.now();
  const image = fs.readFileSync(goldenCase.image);
  const mimeType = path.extname(goldenCase.image).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const response = await fetch(`${baseUrl}/api/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: {
        mimeType,
        base64: image.toString("base64"),
        fileName: path.basename(goldenCase.image),
      },
      capture: { mode: "upload" },
      regionHint: goldenCase.regionHint,
      municipality: goldenCase.municipality,
      locale: goldenCase.locale,
    }),
  });
  const result = await response.json();
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    caseResults.push({
      id: goldenCase.id,
      passed: false,
      latencyMs,
      error: result.error ?? `HTTP ${response.status}`,
      expectedItems: goldenCase.expectedItems.length,
      matchedItems: 0,
      unresolvedItems: 0,
      modelCalls: 0,
      strategies: [],
      assertionFailures: [`request failed: HTTP ${response.status}`],
      safetyViolations: [],
    });
    continue;
  }
  caseResults.push(scoreCase(goldenCase, result, latencyMs));
}

const latencies = caseResults.map((item) => item.latencyMs).sort((a, b) => a - b);
const report = {
  label,
  goldenVersion: golden.version,
  goldenStatus: golden.status,
  split,
  generatedAt: new Date().toISOString(),
  summary: {
    cases: caseResults.length,
    passed: caseResults.filter((item) => item.passed).length,
    safetyViolations: caseResults.reduce((sum, item) => sum + item.safetyViolations.length, 0),
    expectedItems: caseResults.reduce((sum, item) => sum + item.expectedItems, 0),
    matchedItems: caseResults.reduce((sum, item) => sum + item.matchedItems, 0),
    itemRecall: ratio(
      caseResults.reduce((sum, item) => sum + item.matchedItems, 0),
      caseResults.reduce((sum, item) => sum + item.expectedItems, 0),
    ),
    unresolvedItems: caseResults.reduce((sum, item) => sum + item.unresolvedItems, 0),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    averageModelCalls: average(caseResults.map((item) => item.modelCalls).filter(Number.isFinite)),
  },
  cases: caseResults,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) fs.writeFileSync(output, serialized);
if (markdownOutput) fs.writeFileSync(markdownOutput, renderMarkdown(report));
process.stdout.write(serialized);
if (report.summary.safetyViolations > 0) process.exitCode = 1;

function scoreCase(goldenCase, result, latencyMs) {
  const safetyViolations = [];
  const assertionFailures = [];
  let matchedItems = 0;

  for (const item of result.items ?? []) {
    if (item.strategy === "knowledge" && (!item.evidence?.length || item.evidence.some((source) => !isHttpUrl(source.url)))) {
      safetyViolations.push(`${item.item?.name ?? "unknown"}: knowledge answer has invalid evidence`);
    }
    if (item.strategy === "unresolved" && item.components?.length) {
      safetyViolations.push(`${item.item?.name ?? "unknown"}: unresolved answer has components`);
    }
  }

  for (const expected of goldenCase.expectedItems) {
    const actual = result.items?.find((item) => item.ruleKey === expected.ruleKey);
    if (!actual) {
      assertionFailures.push(`${expected.ruleKey}: item not found`);
      continue;
    }
    matchedItems += 1;
    const destinations = new Set(actual.components.map((component) => component.destination.type));
    for (const destination of expected.requiredDestinations) {
      if (!destinations.has(destination)) assertionFailures.push(`${expected.ruleKey}: missing ${destination}`);
    }
    for (const destination of expected.forbiddenDestinations) {
      if (destinations.has(destination)) safetyViolations.push(`${expected.ruleKey}: forbidden ${destination}`);
    }
  }

  return {
    id: goldenCase.id,
    passed: assertionFailures.length === 0 && safetyViolations.length === 0,
    latencyMs,
    expectedItems: goldenCase.expectedItems.length,
    matchedItems,
    unresolvedItems: result.items?.filter((item) => item.strategy === "unresolved").length ?? 0,
    strategies: [...new Set((result.items ?? []).map((item) => item.strategy))],
    modelCalls: result.model?.calls ?? 1,
    assertionFailures,
    safetyViolations,
  };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : 0;
}

function ratio(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 1000 : 0;
}

function renderMarkdown(value) {
  const safetyPassed = value.summary.safetyViolations === 0;
  const itemRecall = value.summary.itemRecall ??
    ratio(value.summary.matchedItems, value.summary.expectedItems);
  const lines = [
    `# Classification evaluation: ${escapeMarkdown(value.label)}`,
    "",
    `> Golden dataset v${value.goldenVersion} (${value.goldenStatus}), split: ${value.split}`,
    "",
    `Generated: ${value.generatedAt}`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Cases passed | ${value.summary.passed}/${value.summary.cases} |`,
    `| Safety gate | ${safetyPassed ? "PASS" : "FAIL"} |`,
    `| Safety violations | ${value.summary.safetyViolations} |`,
    `| Item recall | ${(itemRecall * 100).toFixed(1)}% (${value.summary.matchedItems}/${value.summary.expectedItems}) |`,
    `| Unresolved items | ${value.summary.unresolvedItems} |`,
    `| p50 latency | ${value.summary.p50LatencyMs} ms |`,
    `| p95 latency | ${value.summary.p95LatencyMs} ms |`,
    `| Average model calls | ${value.summary.averageModelCalls} |`,
    "",
    "## Cases",
    "",
    "| Status | Case | Matched | Unresolved | Strategies | Calls | Latency |",
    "|---|---|---:|---:|---|---:|---:|",
    ...value.cases.map((item) => (
      `| ${item.passed ? "PASS" : "FAIL"} | ${escapeTable(item.id)} | ${item.matchedItems}/${item.expectedItems} | ${item.unresolvedItems} | ${escapeTable(item.strategies.join(", ") || "-")} | ${item.modelCalls} | ${item.latencyMs} ms |`
    )),
    "",
  ];

  const failed = value.cases.filter((item) => (
    !item.passed || (item.assertionFailures?.length ?? 0) > 0 || (item.safetyViolations?.length ?? 0) > 0
  ));
  if (failed.length > 0) {
    lines.push("## Failures", "");
    for (const item of failed) {
      lines.push(`### ${escapeMarkdown(item.id)}`, "");
      for (const failure of item.assertionFailures ?? []) lines.push(`- Assertion: ${escapeMarkdown(failure)}`);
      for (const violation of item.safetyViolations ?? []) lines.push(`- Safety: ${escapeMarkdown(violation)}`);
      if (!item.assertionFailures?.length && !item.safetyViolations?.length) {
        lines.push("- Assertion: expected result was not matched");
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}[\]<>])/g, "\\$1");
}

function escapeTable(value) {
  return escapeMarkdown(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
