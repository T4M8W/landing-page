// netlify/functions/extractTimetable.js

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const timetableText = body.timetable_text;

    if (!timetableText || typeof timetableText !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing timetable_text in request body",
        }),
      };
    }

    const systemPrompt = `
You are a careful assistant that extracts a school timetable from messy text.

Return a JSON object with a single key "sessions", whose value is an array
of objects. Each object MUST have exactly these keys:

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

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.0,
          max_tokens: 1500,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const text = await openaiResponse.text();
      console.error("OpenAI API error (extractTimetable):", text);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Error from OpenAI API",
          detail: text,
        }),
      };
    }

    const completion = await openaiResponse.json();
    let rawContent = completion?.choices?.[0]?.message?.content || "";

    // --- NEW: robust JSON extraction ------------------------------------
    // 1) Strip ``` fences if they exist
    rawContent = rawContent.trim();
    if (rawContent.startsWith("```")) {
      const firstBrace = rawContent.indexOf("{");
      const lastBrace = rawContent.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        rawContent = rawContent.slice(firstBrace, lastBrace + 1);
      }
    }

    // 2) If there's extra text before/after, grab the first JSON-looking block
    if (!rawContent.trim().startsWith("{")) {
      const firstBrace = rawContent.indexOf("{");
      const lastBrace = rawContent.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        rawContent = rawContent.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error(
        "Failed to parse model JSON (extractTimetable):",
        rawContent
      );
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Model returned invalid JSON.",
        }),
      };
    }

    if (!parsed || typeof parsed !== "object") {
      parsed = {};
    }

    let sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    // Light validation / normalisation
    const cleanSessions = sessions
      .map((s) => {
        if (!s) return null;

        const day = (s.day || s.Day || "").trim();
        const start = (s.start || s.Start || "").trim();
        const end = (s.end || s.End || "").trim();
        const label = (s.label || s.Label || "").trim();

        if (!day || !start || !end || !label) return null;

        return { day, start, end, label };
      })
      .filter(Boolean);

    // Always return the same shape the frontend expects
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: cleanSessions }),
    };
  } catch (err) {
    console.error("Error in extractTimetable function:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Server error",
        detail: err.message,
      }),
    };
  }
};
