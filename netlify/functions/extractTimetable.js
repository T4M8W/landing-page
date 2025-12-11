// netlify/functions/extractTimetable.js

export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const timetableText = body.timetable_text;

    if (!timetableText || typeof timetableText !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing timetable_text" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" })
      };
    }

    const systemPrompt = `
You are a careful assistant that extracts a school timetable from messy text.

Return a JSON object with a single key "sessions", whose value is an array of
objects. Each object MUST have exactly these keys:

- "day": one of "Mon", "Tue", "Wed", "Thu", "Fri"
- "start": 24-hour time "HH:MM" (e.g. "09:00")
- "end": 24-hour time "HH:MM"
- "label": short lesson label like "Assembly", "Spelling", "Writing"

RULES:
- Only include sessions that clearly belong to the main school day.
- Ignore anything obviously outside of 08:00–16:00.
- Ignore rows where you can't confidently identify the day, start time, end time and label.
- Do NOT invent times or days that aren't in the text.
- If a row is ambiguous, SKIP it instead of guessing.

Your response MUST be valid JSON and NOTHING ELSE (no commentary, no Markdown).
    `.trim();

    const userPrompt = `
Here is the raw timetable text (copied from a teacher's document):

"""${timetableText}"""

Please extract it into JSON as described.
    `.trim();

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 1200
      })
    });

    const text = await openaiResponse.text();

    if (!openaiResponse.ok) {
      console.error("OpenAI API error (extractTimetable):", openaiResponse.status, text);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Error from OpenAI API",
          status: openaiResponse.status,
          detail: text
        })
      };
    }

    // text should be JSON, but models sometimes wrap it in extra text
    // Try to pull out the JSON block if needed.
    let rawContent = text;
    const firstBrace = rawContent.indexOf("{");
    const lastBrace = rawContent.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      rawContent = rawContent.slice(firstBrace, lastBrace + 1);
    }

    console.log("RAW model content (extractTimetable) snippet:", rawContent.slice(0, 300));

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error("Failed to parse model JSON (extractTimetable):", rawContent);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Model returned invalid JSON",
          raw: rawContent
        })
      };
    }

    if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
      parsed.sessions = [];
    }

    const cleanSessions = parsed.sessions.filter((s) => {
      if (!s) return false;
      const day = s.day || s.Day;
      const start = s.start || s.Start;
      const end = s.end || s.End;
      const label = s.label || s.Label;
      return Boolean(day && start && end && label);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: cleanSessions })
    };
  } catch (err) {
    console.error("Error in extractTimetable function:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", detail: err.message })
    };
  }
}
