// Chip multi-select
const toolsEl = document.getElementById("tools");
function toggleChip(chip) {
  chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
}
toolsEl.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => toggleChip(chip));
  chip.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleChip(chip); }
  });
});

const form = document.getElementById("form");
const submitBtn = document.getElementById("submitBtn");
const statusEl = document.getElementById("status");
const barEl = document.getElementById("bar");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
  statusEl.classList.toggle("err", isError);
}

function collectProfile() {
  const selectedTools = [...toolsEl.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.textContent.trim());
  const focus = document.getElementById("focus").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  return {
    email: document.getElementById("email").value.trim(),
    seniority: document.getElementById("seniority").value,
    focusAreas: focus,
    aiLevel: form.querySelector('input[name="aiLevel"]:checked')?.value || "",
    tools: selectedTools,
    cadence: form.querySelector('input[name="cadence"]:checked')?.value || "weekly",
    includeProject: document.getElementById("includeProject").checked,
  };
}

async function poll(jobId) {
  // Poll up to ~3 minutes, then give a real message instead of spinning forever.
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    let res;
    try {
      res = await fetch(`/api/issue/${jobId}`);
    } catch {
      continue; // transient network hiccup — keep trying
    }
    if (!res.ok) continue;
    const job = await res.json();
    if (job.status === "ready") return job.issue;
    if (job.status === "error") throw new Error(job.message || "Generation failed.");
    // else still "generating" — keep polling
  }
  throw new Error("This is taking longer than expected. Your issue may still arrive by email — try again in a bit.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const profile = collectProfile();
  if (!profile.email) { setStatus("Please enter a valid email.", true); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "Generating your first issue (≈60s)…";
  barEl.classList.remove("hidden");
  setStatus("Saving your profile…");

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Request failed (${res.status}).`);
    }
    const { jobId } = await res.json();
    setStatus("Writing your issue — this takes about a minute…");

    const issue = await poll(jobId);
    renderIssue(issue);
  } catch (err) {
    barEl.classList.add("hidden");
    setStatus(err.message, true);
    submitBtn.disabled = false;
    submitBtn.textContent = "Try again";
  }
});

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
}

function renderIssue(issue) {
  const view = document.getElementById("issueView");
  view.innerHTML = "";

  const wrap = el("div", { className: "issue" });
  wrap.append(el("h2", { textContent: issue.subject }));
  if (issue.greeting) wrap.append(el("p", { className: "greet", textContent: issue.greeting }));

  (issue.sections || []).forEach((s) => {
    const sec = el("section");
    sec.append(el("h3", { textContent: s.heading }));
    (s.items || []).forEach((it) => {
      const item = el("div", { className: "item" });
      item.append(el("div", { className: "t", textContent: it.title }));
      item.append(el("div", { textContent: it.body }));
      sec.append(item);
    });
    wrap.append(sec);
  });

  const bp = issue.buildProject;
  if (bp && bp.title) {
    const box = el("div", { className: "build" });
    box.append(el("span", { className: "tag", textContent: "Build this week" }));
    box.append(el("div", { className: "t", textContent: bp.title, style: "font-weight:600;font-size:18px" }));
    if (bp.timeEstimate) box.append(el("div", { className: "greet", textContent: bp.timeEstimate }));
    const ol = el("ol");
    (bp.steps || []).forEach((step) => ol.append(el("li", { textContent: step })));
    box.append(ol);
    wrap.append(box);
  }

  if (issue.signoff) wrap.append(el("p", { className: "signoff", textContent: issue.signoff }));

  view.append(wrap);
  document.getElementById("formView").classList.add("hidden");
  view.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
