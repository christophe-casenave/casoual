// Vercel KV-backed voting API
// GET /api/votes → returns all vote counts
// POST /api/votes { game: "boop" } → vote for a game

const GAMES = ['boop', 'stack', 'dash', 'drift', 'slice', 'dotrace'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: 'KV not configured' });
  }

  const kvFetch = (cmd) =>
    fetch(`${kvUrl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    }).then(r => r.json());

  try {
    if (req.method === 'GET') {
      // Get all vote counts
      const results = {};
      for (const game of GAMES) {
        const data = await kvFetch(['GET', `votes:${game}`]);
        results[game] = parseInt(data.result) || 0;
      }
      return res.status(200).json(results);
    }

    if (req.method === 'POST') {
      const { game } = req.body || {};
      if (!game || !GAMES.includes(game)) {
        return res.status(400).json({ error: 'Invalid game' });
      }

      // Rate limit by IP (1 vote per game per day)
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const ipKey = `voted:${game}:${ip.split(',')[0].trim()}`;

      const already = await kvFetch(['GET', ipKey]);
      if (already.result) {
        return res.status(429).json({ error: 'Already voted today', votes: parseInt(already.result) || 0 });
      }

      // Increment vote
      const data = await kvFetch(['INCR', `votes:${game}`]);

      // Mark IP as voted (expires in 24h)
      await kvFetch(['SET', ipKey, '1', 'EX', 86400]);

      return res.status(200).json({ game, votes: data.result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
