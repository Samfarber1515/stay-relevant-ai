import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MODEL = "claude-opus-4-8";

const ISSUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string", description: "Email subject line, < 70 chars" },
    greeting: { type: "string", description: "One warm, personal opening line" },
    sections: {
      type: "array",
      description: "3-4 sections of genuinely useful, current AI guidance tailored to the reader",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                body: { type: "string", description: "2-4 sentences, concrete and practical" },
              },
              required: ["title", "body"],
            },
          },
        },
        required: ["heading", "items"],
      },
    },
    buildProject: {
      type: "object",
      additionalProperties: false,
      description: "A hands-on project the reader can finish in 15-90 minutes using ONLY their selected tools. Empty title if none requested.",
      properties: {
        title: { type: "string" },
        timeEstimate: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
      },
      required: ["title", "timeEstimate", "steps"],
    },
    signoff: { type: "string" },
  },
  required: ["subject", "greeting", "sections", "buildProject", "signoff"],
};

const RUNG_LABELS = {
  prompts: "Pastes prompts into ChatGPT or Claude (beginner)",
  workflow: "Has built a workflow in Zapier/Make/n8n or a custom GPT (intermediate)",
  code: "Ships code that calls an API or runs in a terminal (advanced)",
};

/**
 * Generate one personalized newsletter issue from a subscriber profile.
 * Throws on failure — the caller records the error on the job.
 */
export async function generateIssue(profile) {
  const tools = (profile.tools || []).join(", ") || "no tools specified";
  const focus = (profile.focusAreas || []).join(", ") || "general AI";
  const wantsProject = !!profile.includeProject;

  const prompt = `You are the editor of a sharp, no-fluff weekly AI newsletter that helps professionals stay relevant as AI changes their field. Write this subscriber's first personalized issue.

Subscriber profile:
- Seniority: ${profile.seniority || "unspecified"}
- Focus areas: ${focus}
- AI experience level: ${RUNG_LABELS[profile.aiLevel] || profile.aiLevel || "unspecified"}
- Tools they actually use: ${tools}
- Cadence: ${profile.cadence || "weekly"}

Write 3-4 sections of genuinely useful, current, specific guidance calibrated to their seniority and experience level. Make it concrete — name techniques, prompt patterns, and moves they can apply this week in their focus areas. No "in today's fast-paced world", no generic hype, no padding.

${
  wantsProject
    ? `Then include ONE "Build this week" project they can finish in 15-90 minutes. CRITICAL: the project may ONLY use tools from this list: ${tools}. Do not suggest a tool they didn't pick. Give clear numbered steps.`
    : `They did NOT request a build project — return buildProject with an empty title, empty timeEstimate, and an empty steps array.`
}

Voice: practical, direct, a little witty. Match the depth to their experience level — don't explain prompting basics to someone who ships code.

Return JSON only.`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema: ISSUE_SCHEMA } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Generation was declined by the safety system.");
  }

  const issue = response.parsed_output;
  if (!issue) throw new Error("Model returned no parseable issue.");
  return issue;
}
