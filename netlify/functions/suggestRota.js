// netlify/functions/suggestRota.js

const fetch = require("node-fetch"); // if you already use this in suggestGroups, keep it consistent

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Expecting the payload from buildRotaPayload():
    // { meta, pupils, name_column, timetable }
    const { pupils, timetable } = body;

    if (!pupils || !Array.isArray(pupils) || !timetable || !Array.isArray(timetable)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payload. Expected pupils[] and timetable[] arrays." })
      };
    }

    // Build a simple text summary for the prompt (keep it small for now)
    const pupilCount = pupils.length;

    const supportSummary = timetable.map((session) => {
      return `${session.day} ${session.start}-${session.end} (${session.label}): support = ${session.support_label}`;
    }).join("\n");

    const systemPrompt = `
You are ChalkboardAI Rota, a planning assistant for a UK primary teacher.
You receive:
- An anonymised list of pupils (no real names)
- A weekly timetable with tagged support availability

Your job is to propose a sensible weekly intervention rota.
Focus on:
- Using the highest-support slots (2+ adults / 1 adult) for the highest need pupils
- Avoiding break, lunch and assemblies for interventions
- Suggesting short, realistic intervention blocks (e.g. 15–30 minutes)
- Keeping workload manageable (don't overload any single day)

Return a clear, human-readable plan with headings and bullet points.
Do not include any real pupil names; use only the anonymised labels you are given.
    `.trim();

    const userPrompt = `
We have ${pupilCount} anonymised pupils in the class.

Here is the timetable with support tags:

${supportSummary}

Based on this, propose a draft weekly intervention plan.
For now, you can assume all pupils are equally in need of support.
In later versions, you will receive detailed pupil data; this prototype is only about using the timetable and support tags sensibly.
    `.trim();

    // Call OpenAI – adjust model + endpoint to match what you're using in suggestGroups.js
    const apiKey = process.env.OPENAI_API_KEY; // set this in Netlify env vars

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable." })
      };
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1200
      })
    });

    if (!openaiResponse.ok) {
      const text = await openaiResponse.text();
      console.error("OpenAI API error:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Error from OpenAI API", detail: text })
      };
    }

    const completion = await openaiResponse.json();
    const planText = completion.choices?.[0]?.message?.content || "No plan generated.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planText })
    };

  } catch (err) {
    console.error("Error in suggestRota function:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", detail: err.message })
    };
  }
};
