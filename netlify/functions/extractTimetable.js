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
You are a careful assistant that extracts a school timetable from messy teacher text.

Your job is to turn that text into a JSON object with a single key "sessions",
whose value is an array of lesson objects. Each object MUST have exactly these keys:

- "day": one of "Mon", "Tue", "Wed", "Thu", "Fri"
- "start": 24-hour time "HH:MM" (e.g. "09:00")
- "end": 24-hour time "HH:MM"
- "label": a short lesson label like "Assembly", "Spelling", "Writing"

The source timetable may:
- Use day names like "Mon", "Monday", "MON".
- Use times like "8.40 – 9.00", "9-45 – 10.45", "13.15-15.00" etc.
  Always normalise these to 24-hour "HH:MM" in your output.

IMPORTANT:
- Return as many sessions as you reasonably can from the text.
- It is better to make a sensible guess (e.g. interpreting "8.40" as "08:40")
  than to discard everything as ambiguous.
- Only skip a row if it is completely unparsable.
- If there is any timetable information at all, the "sessions" array MUST NOT be empty.

You must return VALID JSON only, no commentary, no Markdown.
    `.trim();

    const userPrompt = `
Here is the raw timetable text copied from a teacher document:

"""${timetableText}"""

Please extract it into the JSON format described above.
    `.trim();

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
          max_tokens: 800, // your reduced limit
          response_format: { type: "json_object" },
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

    let content = completion?.choices?.[0]?.message?.content;
    console.error("RAW model content (extractTimetable):", content);

    let parsed = {};

    if (typeof content === "string") {
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.error("JSON.parse error in extractTimetable:", err);
        // Fail soft: no crash, just return empty array
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions: [] }),
        };
      }
    } else if (content && typeof content === "object") {
      parsed = content;
    }

    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    console.error(
      "extractTimetable: sessions length from model:",
      sessions.length
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    };
  } catch (err) {
    console.error("Unexpected error in extractTimetable:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", detail: err.message }),
    };
  }
};
