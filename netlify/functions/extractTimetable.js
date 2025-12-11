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

    // Keep the instructions tight so the model can answer quickly
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

Your response MUST be valid JSON and NOTHING ELSE (no prose, no Markdown).
    `.trim();

    const userPrompt = `
Here is the raw timetable text copied from a teacher document:

"""${timetableText}"""

Extract it into the JSON format described above.
    `.trim();

    // Keep max_tokens modest to stay well inside Netlify's time limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // ~8s cap

    let openaiResponse;
    try {
      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
          max_tokens: 600
        }),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);

      // If we hit our own timeout, return a clear error instead of letting Netlify 504 it
      if (err.name === "AbortError") {
        console.error("OpenAI request timed out in extractTimetable");
        return {
          statusCode: 504,
          body: JSON.stringify({
            error: "Timed out while talking to the AI timetable helper."
          })
        };
      }

      console.error("Network error calling OpenAI (extractTimetable):", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Network error contacting OpenAI." })
      };
    } finally {
      clearTimeout(timeoutId);
    }

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
    const rawContent = completion.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error("Failed to parse model JSON (extractTimetable):", rawContent);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Model returned invalid JSON." })
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
