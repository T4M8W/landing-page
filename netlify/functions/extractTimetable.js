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
You are a careful assistant that extracts a primary-school weekly timetable from messy text.

The input will often look like a pasted table with:

- A header row of times, e.g. "Day/Time  8.40 – 9.00  9.00 – 9.15  9.15 – 9.35 ..."
- One row per day, e.g. "Mon", "Tue", "Wed", "Thurs", "Fri"
- Extra lines like "End of day / Tidy up / Class reader" etc.

Your job is to convert this into a JSON object with a single key "sessions".
"sessions" must be an array of objects, each with EXACTLY these keys:

- "day": one of "Mon", "Tue", "Wed", "Thu", "Fri"
- "start": 24-hour time "HH:MM" (e.g. "08:40", "09:00")
- "end":   24-hour time "HH:MM"
- "label": short lesson label like "Registration", "Assembly", "Spelling", "Writing",
          "Maths", "Reading", "Lunch", "Break", "Handwriting", "PSHE", "PE", etc.

You MUST split the header times into start/end and map the cells for each day.

If the header row says (for example):

"Day/Time  8.40 – 9.00  9.00 – 9.15  9.15 – 9.35  9.35 – 9.45  9.45 – 10.45 ..."

and the Monday row says something like:

"Mon  Registration (Readers, catch-up, free writing)  Assembly  Spelling  Writing  Reading  Break  Maths  Mastering number / Times tables  Lunch  Handwriting  PSHE  PE"

then you should produce sessions like:

{
  "sessions": [
    { "day": "Mon", "start": "08:40", "end": "09:00", "label": "Registration" },
    { "day": "Mon", "start": "09:00", "end": "09:15", "label": "Assembly" },
    { "day": "Mon", "start": "09:15", "end": "09:35", "label": "Spelling" },
    { "day": "Mon", "start": "09:35", "end": "09:45", "label": "Writing" },
    { "day": "Mon", "start": "09:45", "end": "10:45", "label": "Writing" },
    { "day": "Mon", "start": "10:45", "end": "11:00", "label": "Break" },
    { "day": "Mon", "start": "11:00", "end": "12:00", "label": "Maths" },
    { "day": "Mon", "start": "12:00", "end": "12:15", "label": "Reading" },
    { "day": "Mon", "start": "12:15", "end": "13:15", "label": "Lunch" },
    { "day": "Mon", "start": "13:15", "end": "15:00", "label": "Afternoon lessons (e.g. Handwriting / PSHE / PE)" },
    { "day": "Mon", "start": "15:00", "end": "15:20", "label": "Class reader / End of day" }
  ]
}

RULES:
- Interpret times like "8.40" or "9-45" as their 24-hour equivalents: "08:40", "09:45".
- It is OK to normalise labels slightly (e.g. "Mastering number / Times tables" → "Mastering number / Times tables").
- Do NOT add commentary or extra keys.
- Try to use your best judgement to assign labels based on the row text.
- If something is very unclear, you may skip that particular slot, but aim to extract as many sessions as possible.

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
        temperature: 0.1,
        max_tokens: 1600
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

    // Try to isolate a JSON object from the model response
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", detail: err.message })
    };
  }
}
