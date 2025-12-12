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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Server is not configured correctly (no API key).",
        }),
      };
    }

    const systemPrompt = `
You are a careful assistant that extracts a school timetable from messy text.

Return a JSON object with a single key "sessions", whose value is an array of objects.
Each object MUST have exactly these keys:

- "day": one of "Mon", "Tue", "Wed", "Thu", "Fri"
- "start": 24-hour time "HH:MM" (e.g. "09:00")
- "end": 24-hour time "HH:MM"
- "label": short lesson label like "Assembly", "Spelling", "Writing"

RULES:
- Only include sessions that clearly belong to the main school day (roughly 08:00–16:00).
- Ignore rows where you can't confidently identify day, start time, end time AND label.
- Do NOT invent times or days that aren't in the text.
- If a row is ambiguous, SKIP it instead of guessing.
    `.trim();

    const userPrompt = `
Here is the raw timetable text copied from a teacher document:

"""${timetableText}"""

Please extract it into the JSON format described above.
    `.trim();

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 1500,
        // 🔑 Ask OpenAI to return STRICT JSON
        response_format: { type: "json_object" },
      }),
    });

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

    let content = completion?.choices?.[0]?.message?.content;
    let parsed;

    // With response_format: json_object, content *should* already be JSON,
    // but we'll handle both a string and an object defensively.
    if (typeof content === "string") {
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.error("Failed to JSON.parse content string:", content);
        parsed = {};
      }
    } else if (content && typeof content === "object") {
      parsed = content;
    } else {
      console.error("Unexpected content format from OpenAI:", content);
      parsed = {};
    }

    let sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    const cleanSessions = sessions
      .map((s) => {
        if (!s) return null;

        const day   = (s.day   || s.Day   || "").trim();
        const start = (s.start || s.Start || "").trim();
        const end   = (s.end   || s.End   || "").trim();
        const label = (s.label || s.Label || "").trim();

        if (!day || !start || !end || !label) return null;

        return { day, start, end, label };
      })
      .filter(Boolean);

    console.error("extractTimetable: extracted", cleanSessions.length, "sessions");

    // ✅ IMPORTANT: always return 200 with { sessions: [...] }
    // even if it's an empty array – do NOT throw a 500 for JSON issues.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: cleanSessions }),
    };
  } catch (err) {
    console.error("Unexpected error in extractTimetable:", err);
    // Also fail softly here: frontend will just see sessions: [] if we want
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [] }),
    };
  }
};
