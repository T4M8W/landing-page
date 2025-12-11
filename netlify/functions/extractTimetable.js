// netlify/functions/extractTimetable.js

export async function handler(event, context) {
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
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" })
      };
    }

    const systemPrompt = `
You are a careful assistant that extracts a school timetable from messy text.
Return valid JSON only.
`.trim();

    const userPrompt = `
Extract sessions from this timetable text:

"""${timetableText}"""
`.trim();

    const completion = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
          temperature: 0.0
        })
      }
    );

    const data = await completion.json();
    const rawContent = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error("JSON parse error:", rawContent);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Model returned invalid JSON",
          raw: rawContent
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: parsed.sessions || [] })
    };

  } catch (err) {
    console.error("extractTimetable error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
}
