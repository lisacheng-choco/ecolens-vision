import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const baseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !key) throw new Error("Missing Supabase environment variables");

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
const command = process.argv[2] ?? "list";

if (command === "list") {
  const response = await fetch(
    `${baseUrl}/rest/v1/feedback_review_queue?select=*&order=last_seen.desc&limit=1000`,
    { headers },
  );
  if (!response.ok) throw new Error(`Unable to load review queue (${response.status})`);
  const queue = await response.json();
  const rank = { high: 0, medium: 1, low: 2 };
  queue.sort((a, b) => rank[a.priority] - rank[b.priority]);
  console.table(queue);
} else if (command === "approve" || command === "reject") {
  const id = process.argv[3];
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) throw new Error("A feedback UUID is required");

  const response = await fetch(`${baseUrl}/rest/v1/feedback?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      status: command === "approve" ? "approved" : "rejected",
      reviewed_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Unable to update feedback (${response.status})`);
  const rows = await response.json();
  if (rows.length !== 1) throw new Error("Feedback was not found");
  console.log(`${command}d ${id}`);
} else {
  throw new Error("Use: list | approve <feedback-id> | reject <feedback-id>");
}
