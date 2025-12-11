// netlify/functions/extractTimetable.js

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const timetableText = body.timetable_text;

    if (!timetableText || typeof timetableText !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing timetable_text" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing OPENAI_API_KEY environment variable."
        })
      };
    }

    const systemPrompt = `
You turn messy teacher timetables into a clean list of lessons.

Return a JSON object with one key: "sessions".
"sessions" must be an array of objects, each with:

- "day": one of "Mon", "Tue", "Wed", "Thu", "Fri"
- "start": 24-hour time "HH:MM" (e.g. "09:00")
- "end": 24-hour time "HH:MM"
- "label": short lesson label, e.g. "Assembly", "Spelling", "Writing".

Rules:
- Only include sessions clearly in the main school day (around 08:00–16:00).
- Ignore rows where you cannot confidently identify day, start time, end time AND label.
- Do not invent days or times that are not in the text.
- If something is ambiguous, skip it rather than guessing.

Your response MUST be a JSON object and NOTHING ELSE (no prose, no Markdown).
    `.trim();

    const userPrompt = `
Here is the raw timetable text copied from a teacher document:

"""${timetableText}"""

Extract it into the JSON format described above.
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
        // Ask OpenAI to give us a JSON object
        response_format: { type: "json_object" },
        temperature: 0.0,
        max_tokens: 600
      })
    });

    if (!openaiResponse.ok) {
      const text = await openaiResponse.text();
      console.error("OpenAI API error (extractTimetable):", text);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Error from OpenAI API",
          detail: text
        })
      };
    }

    const completion = await openaiResponse.json();

    // This may be either a string (JSON text) or an object (already parsed)
    const content = completion.choices?.[0]?.message?.content;

    let parsed;
    if (typeof content === "string") {
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.error("Failed to parse content string as JSON (extractTimetable):", content);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Model returned invalid JSON string." })
        };
      }
    } else if (content && typeof content === "object") {
      // With response_format: json_object, content is often already a JSON object
      parsed = content;
    } else {
      console.error("Unexpected content format from OpenAI (extractTimetable):", content);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Unexpected format from AI response." })
      };
    }

    let sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    // Light validation / normalisation
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

    console.log("extractTimetable: extracted", cleanSessions.length, "sessions");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: cleanSessions })
    };
  } catch (err) {
    console.error("Error in extractTimetable function:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", detail: err.message })
    };
  }
};
