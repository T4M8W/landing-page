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

  // ---------- Pronoun / gender handling ----------

  const pronounsRaw =
    pupilData.Pronouns ??
    pupilData.pronouns ??
    pupilData.Gender ??
    pupilData.gender ??
    "";

  let subjectPronoun = "they";
  let objectPronoun = "them";
  let possessivePronoun = "their";

  const lowerPronouns = String(pronounsRaw).toLowerCase();

  if (lowerPronouns.includes("he")) {
    subjectPronoun = "he";
    objectPronoun = "him";
    possessivePronoun = "his";
  } else if (lowerPronouns.includes("she")) {
    subjectPronoun = "she";
    objectPronoun = "her";
    possessivePronoun = "her";
  }
  // If nothing useful is provided, we fall back to they/them/their.

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
- Avoid overly casual character labels (e.g. "cheeky chap", "mischievous"); keep descriptions neutral and respectful.
⭐ - Only include information that is supported by the CCR data or safe, generic primary-report norms.
⭐ - Do NOT invent test outcomes, specific incidents, or detailed anecdotes.
⭐ - If CCR data is sparse, write general but professional learning comments.
`;

  const userMessage = `
${toneInstruction}

${extraStyle}

You will be given:

1) A pseudonym for the pupil (do not try to guess their real name).
2) A single "pupil profile" row from the class record (CCR).
3) A list of report sections with word targets and next-step requirements.

Use gendered pronouns that match this pupil:

- Subject pronoun: "${subjectPronoun}"
- Object pronoun: "${objectPronoun}"
- Possessive pronoun: "${possessivePronoun}"

Use the pseudonym "${pupilId}" sparingly:
- Use it once at the start of the first paragraph.
- After that, normally use pronouns so the report flows naturally.
- Never repeat the pseudonym more than twice in any section.

For each report section:
⭐ - Write between 0.9 × wordTarget and 1.1 × wordTarget words.
⭐ - Never write fewer than 0.9 × wordTarget words.
⭐ - Keep the content focused ONLY on that section's topic.
⭐ - Use varied sentence structures; avoid repetition.
⭐ - Ground all claims in what the CCR data reasonably implies.

SECTION CONTENT:
- Each section must focus ONLY on its named topic.
- For subjects with clear matching CCR columns (e.g. Reading, Writing, Maths), base your comments as directly as possible on those columns.
- For subjects with no obvious CCR column (e.g. Science if no science-specific data is present), you MAY write a safe, general comment that reflects typical learning in that subject for this pupil’s age, but keep it measured and professional.
- If the CCR gives little or no information related to a section, treat that section as "data-sparse": write a general but appropriate comment and mark it as such in the JSON meta data (see OUTPUT FORMAT).

SPECIAL CASE – TEACHER / GENERAL / OVERALL COMMENT (or similar) SECTIONS:
- If a section name suggests an overall or general comment (e.g. contains "Teacher", "General", or "Overall"),
  then you MUST synthesise information from across the whole CCR row, not just one column.
- In these sections, draw briefly on key strengths, needs, and attitudes visible across subjects.
- Still obey the word count rules, and keep the tone consistent with the rest of the report.
- Mark these sections as "synthesised" in the JSON meta data (see OUTPUT FORMAT).

OUTPUT FORMAT:
Return ONLY a JSON object with:
- One key per section: "<section name>" for the main comment text.
- If a next step is requested: "<section name>_next_step" for the next-step sentence.
- An optional source key per section: "<section name>_source" with one of:
  - "direct"      → comment based mainly on clearly relevant CCR columns
  - "synthesised" → comment synthesises information across multiple CCR columns
  - "generic"     → comment is a safe, general statement because little/no relevant data was present

No explanations or text outside the JSON object.

SOURCE LABELS:
- Use "direct" when the section comment is clearly grounded in matching CCR columns (e.g. Reading, Writing, Maths).
- Use "synthesised" for overall/teacher/general comments that draw from several columns.
- Use "generic" where there is little or no relevant CCR data and you needed to rely on safe, general statements.

Generate a JSON object ONLY, with:
- One key per section: "<section name>"
- If next steps are required: "<section name>_next_step"

The JSON must contain no commentary outside the object.

Example:

{
  "English": "Main English comment…",
  "English_next_step": "Next step…",
  "Maths": "Main Maths comment…",
  "Maths_next_step": "Next step…",
  "Teacher Comment": "Final paragraph…"
}

Pupil pseudonym: ${pupilId}

Pupil profile (CCR data):
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
