import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { generateIssue } from "./lib/generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// In-memory job store. status: "generating" | "ready" | "error"
// For a single-instance server this is fine; swap for Redis/DB to scale out.
const jobs = new Map();

async function persistSubscriber(profile) {
  const dir = join(__dirname, "data");
  await mkdir(dir, { recursive: true });
  await appendFile(
    join(dir, "subscribers.jsonl"),
    JSON.stringify({ ...profile, ts: new Date().toISOString() }) + "\n"
  );
}

function validate(body) {
  if (!body || typeof body !== "object") return "Missing body.";
  if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return "A valid email is required.";
  return null;
}

// Kick off a job. Returns a jobId immediately — generation runs in the background,
// so the HTTP request never blocks on the ~60s model call (the bug in the old app).
app.post("/api/subscribe", async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const profile = {
    email: req.body.email,
    name: req.body.name || "",
    seniority: req.body.seniority || "",
    focusAreas: req.body.focusAreas || [],
    aiLevel: req.body.aiLevel || "",
    tools: req.body.tools || [],
    cadence: req.body.cadence || "weekly",
    includeProject: !!req.body.includeProject,
  };

  try {
    await persistSubscriber(profile);
  } catch (e) {
    console.error("persist failed:", e);
    // Non-fatal — still generate the issue.
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "generating", createdAt: Date.now() });

  // Fire and forget. Errors are captured onto the job, never thrown into the request.
  generateIssue(profile)
    .then((issue) => jobs.set(jobId, { status: "ready", issue, createdAt: Date.now() }))
    .catch((e) => {
      console.error("generation failed:", e);
      jobs.set(jobId, { status: "error", message: e.message || "Generation failed.", createdAt: Date.now() });
    });

  res.status(202).json({ jobId });
});

// Poll for the result.
app.get("/api/issue/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ status: "not_found" });
  res.json(job);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Stay Relevant AI running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠  ANTHROPIC_API_KEY is not set — generation will fail until you set it.");
  }
});
