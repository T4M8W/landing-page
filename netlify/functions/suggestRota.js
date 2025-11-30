// netlify/functions/suggestRota.js

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

All pupil identifiers are pseudonyms such as ${pseudonyms.slice(0, 8).join(", ")}.
These are already anonymised. 

IMPORTANT:
- Always refer to pupils ONLY by these exact pseudonyms.
- Do NOT create new labels like "Pupil A" or "Pupil X" or "Student 1".
- Do NOT renumber or rename pupils.

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
You are ChalkboardAI, an assistant that creates clear, practical, timetable-aligned intervention plans for teachers. You must follow all instructions carefully.

-----------------------------------------
IDENTITY & PRIVACY RULES (IMPORTANT)
-----------------------------------------
You will receive:
• A list of anonymised pupils (e.g. "Pupil 1", "Pupil 2", "Pupil 3")
• A parsed school timetable grid (session-by-session)
• A list of mandatory interventions (EHCP / PLP requirements)
• The number of adults available per session

RULES:
1. You must refer to pupils **only** by the pseudonyms provided in the PUPILS JSON.
2. You must NOT invent new names or codes (e.g. “Pupil A”, “Student X”, “Child 1”).
3. You must NOT renumber or rename any pupil.
4. Only use the pseudonyms exactly as they appear in the data.

-----------------------------------------
TIMETABLE RULES (REAL SCHOOL CONTEXT)
-----------------------------------------
You must follow these constraints when scheduling interventions:

• Interventions can only occur during legitimate in-school sessions.  
• Avoid scheduling during:  
  – Break (10:45–11:00)  
  – Lunch (12:15–13:00)  
  – Registration (8:40–9:00 and 13:00–13:15)  
  – Assembly (if marked in the timetable)  
• Do NOT schedule during specialist subjects unless the timetable clearly indicates flexibility.  
• Avoid PE unless unavoidable.  
• Avoid Number Sense / Spelling / Maths whole-class teaching unless the grid colour tags explicitly allow support.

If a session is marked as:
• 🔴 Outside school hours → no interventions allowed.  
• 🌸 In school, no support available → no interventions allowed.  
• 🟡 Partial support → 1 pupil maximum.  
• 🟢 One adult available → small-group intervention allowed (1–3 pupils).  
• 🔵 Two or more adults → multiple groups allowed. Only schedule within the adult capacity given.

-----------------------------------------
MANDATORY INTERVENTIONS
-----------------------------------------
You will be given a list of compulsory interventions (EHCP or PLP requirements).

RULES:
• These MUST be scheduled first.
• They cannot be replaced, removed, or deprioritised.
• They should occur at consistent times each week unless impossible.

-----------------------------------------
INTERVENTION DESIGN PRINCIPLES
-----------------------------------------
When building the weekly plan:
• Sessions should be short, clear, and specific (e.g. 15–20 mins).  
• Spread support fairly without overloading the same session.  
• Avoid repeatedly removing the same pupil from the same lesson unless required.  
• Keep the plan realistic for a real classroom: minimal disruption, predictable routine.

When choosing which pupils to group together:
• Prefer small targeted groups.  
• Avoid pairing pupils whose notes suggest poor pairing (e.g. “avoid grouping with Row 3”).  
• Aim for consistency each week.  

-----------------------------------------
OUTPUT FORMAT
-----------------------------------------
Your response must follow this structure:

### Weekly Intervention Plan

#### [Day]
- **[Time] ([Subject])**  
  - List pupils exactly as given (“Pupil 3 and Pupil 7”)  
  - State the intervention purpose (from notes if available)

(Repeat for all days with scheduled sessions)

### Notes
- Include 3–6 bullet points explaining the logic:
  • How mandatory interventions were scheduled  
  • Why certain slots were chosen  
  • Any constraints you respected  
  • How adult capacity was used  

-----------------------------------------
DATA PROVIDED
-----------------------------------------
Below is the anonymised data you must use.  
Remember: **use the pseudonyms EXACTLY as listed.**

PUPILS JSON:
{{PUPILS_JSON}}

TIMETABLE JSON:
{{TIMETABLE_JSON}}

MANDATORY INTERVENTIONS:
{{MANDATORY_JSON}}

ADULT AVAILABILITY:
{{ADULTS_JSON}}

-----------------------------------------

Create the most realistic, maximally helpful, teacher-ready weekly intervention plan possible.  

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
