// netlify/functions/suggest-groups.js

// This function receives { prompt } in the request body,
// sends it to OpenAI, and returns { suggestion } to the frontend.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

exports.handler = async (event, context) => {
  const jsonHeaders = {
    'Content-Type': 'application/json',
  };

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' }),
    };
  }

  // Parse body
  let prompt;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt;
  } catch (err) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Invalid JSON in request body.' }),
    };
  }

  if (!prompt) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'No prompt provided.' }),
    };
  }

  if (!OPENAI_API_KEY) {
    console.error('❌ Missing OPENAI_API_KEY environment variable.');
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Server misconfiguration: missing API key.' }),
    };
  }

  try {
    // Call OpenAI Chat Completions API directly with fetch
    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an educational support assistant helping a teacher group pupils. Use only the provided names. Do not invent or change names.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
      }),
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error('OpenAI API error:', data);
      return {
        statusCode: apiResponse.status,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: 'OpenAI API request failed.',
          details: data.error || data,
        }),
      };
    }

    const suggestion = data.choices?.[0]?.message?.content || '';

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ suggestion }),
    };
  } catch (error) {
    console.error('Unexpected error calling OpenAI:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Failed to fetch from OpenAI.' }),
    };
  }
};
