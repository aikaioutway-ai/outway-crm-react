module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  try {
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!requestBody?.messages) {
      return res.status(400).json({ error: 'Missing OCR request payload' });
    }

    const body = {
      ...requestBody,
      model: process.env.ANTHROPIC_OCR_MODEL || requestBody.model || 'claude-haiku-4-5-20251001',
    };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const text = await anthropicRes.text();
    res.status(anthropicRes.status);
    res.setHeader('content-type', anthropicRes.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'OCR request failed',
    });
  }
};
