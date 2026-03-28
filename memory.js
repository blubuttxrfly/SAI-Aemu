// api/memory.js
// Reads and writes Aemu's living memory to Upstash Redis
// GET  /api/memory?action=get  → { memories: {...} }
// POST /api/memory              body: { memories: {...} }

const MEMORY_KEY = 'aemu:riley:memories';

async function redisGet(url, token, key) {
  const r = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : {};
}

async function redisSet(url, token, key, value) {
  await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(JSON.stringify(value))
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // If Redis not configured, return empty gracefully
  if (!redisUrl || !redisToken) {
    if (req.method === 'GET') { res.status(200).json({ memories: {} }); return; }
    res.status(200).json({ ok: true }); return;
  }

  try {
    if (req.method === 'GET') {
      const memories = await redisGet(redisUrl, redisToken, MEMORY_KEY);
      res.status(200).json({ memories });
    } else if (req.method === 'POST') {
      const { memories } = req.body;
      if (memories) await redisSet(redisUrl, redisToken, MEMORY_KEY, memories);
      res.status(200).json({ ok: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Memory error:', err);
    res.status(500).json({ error: 'Memory field disruption' });
  }
}
