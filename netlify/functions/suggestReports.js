// netlify/functions/suggestReports.js

exports.handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing");
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing OPENAI_API_KEY in environment" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    console.error("Bad JSON payload", err);
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON in request body" }),
    };
  }

  const { pupilId, pupilData, template, tone, styleNotes } = payload || {};

  if (!pupilId || !pupilData || !Array.isArray(template) || template.length === 0) {
    console.error("Missing required fields", { pupilId, template });
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing pupilId, pupilData or template in payload" }),
    };
  }

  // ---------- Build the prompt ----------

  let toneInstruction;
  switch (tone) {
    case "warm":
      toneInstruction =
        "Use a warm, encouraging tone appropriate for a UK primary school, while remaining professional and measured.";
      break;
    case "concise":
      toneInstruction =
        "Use a concise, formal tone appropriate for a UK primary school report. Keep sentences fairly short and direct.";
      break;
    case "balanced":
    default:
      toneInstruction =
        "Use a balanced, professional tone typical of a UK primary school report: clear, specific, and positive but not over-effusive.";
      break;
  }

  const extraStyle =
    styleNotes && styleNotes.trim().length
      ? `Additional style guidance from the teacher:\n${styleNotes.trim()}\n\n`
      : "";

  const sectionsDescription = template
    .map(
      (sec) =>
        `- Section name: "${sec.name}", word target: ${sec.wordTarget}, include next step: ${
          sec.includeNextStep ? "yes" : "no"
        }`
    )
    .join("\n");

  const pupilJson = JSON.stringify(pupilData, null, 2);

  const systemMessage = `
You are helping a UK primary-school teacher write end-of-year reports.

RULES:
- Use British English spelling and vocabulary (colour, behaviour, organise, maths, etc.).
- Use "pupil" rather than "student".
- Do not use American idioms, slang, or corporate language.
- Keep the tone appropriate for UK primary reports: parent-facing, professional, kind, and specific.
- Do not invent safeguarding information, behaviour incidents, family situations, or medical details.
- Only talk about learning, strengths, needs, classroom learning behaviours, and next steps.
- Do not include any sensitive safeguarding content; assume this is a general classroom report.
- Avoid overly casual character labels (e.g. "cheeky chap", "mischievous"); keep descriptions neutral and respectful.
`;

  const userMessage = `
${toneInstruction}

${extraStyle}

You will be given:

1) A pseudonym for the pupil (do not try to guess their real name).
2) A single "pupil profile" row from a class record (CCR).
3) A list of report sections with word targets and whether they need a separate "next step" sentence.

Generate a JSON object ONLY, with no extra text. The JSON should have:
- One key for each section's main comment, using the section name as the key.
- If the section has a next step, add another key named "<section name>_next_step" for a single-sentence target.

Example JSON structure (just shape, not content):

{
  "English": "Main English comment...",
  "English_next_step": "Next step sentence...",
  "Maths": "Main Maths comment...",
  "Maths_next_step": "Next step sentence...",
  "Teacher Comment": "Overall teacher comment..."
}

Make sure each main comment roughly matches, but does not hugely exceed, the word target.
Keep the content grounded in the pupil profile data.

Report sections to generate:
${sectionsDescription}

Pupil pseudonym: ${pupilId}

Pupil profile (one row from the class record):
${pupilJson}
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // adjust if you're using a different model
        temperature: 0.4,
        response_format: { type: "json_object" }, // ask explicitly for JSON
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI API error:", response.status, text);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "Error from OpenAI API",
          details: text,
        }),
      };
    }

    const data = await response.json();

    // With response_format: json_object, content should already be plain JSON.
    let content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      // Just in case, stringify it
      content = JSON.stringify(content);
    }

    let jsonOutput;
    try {
      // Clean up any stray code fences (belt and braces)
      const cleaned = content.replace(/```json|```/g, "").trim();
      jsonOutput = JSON.parse(cleaned);
    } catch (err) {
      console.error("Failed to parse model JSON:", err, "Raw content:", content);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "Model did not return valid JSON",
          raw: content,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonOutput),
    };
  } catch (err) {
    console.error("Unexpected error in suggestReports:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Unexpected server error" }),
    };
  }
};
