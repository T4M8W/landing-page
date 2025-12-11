// netlify/functions/extractTimetable.js

export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  // Just prove the function is alive and talking to the frontend
  let timetableText = "";
  try {
    const body = JSON.parse(event.body || "{}");
    timetableText = body.timetable_text || "";
  } catch (e) {
    // ignore
  }

  console.log("extractTimetable test hit. Text length:", timetableText.length);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessions: [
        { day: "Mon", start: "09:00", end: "09:20", label: "Assembly" },
        { day: "Mon", start: "09:20", end: "09:40", label: "Spelling" }
      ]
    })
  };
}
