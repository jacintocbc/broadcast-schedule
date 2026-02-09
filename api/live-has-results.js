import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables'
    });
  }

  try {
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.json({ results: {} });
    }
    const results = {};
    for (const ev of events) {
      const sport = (ev.sport || '').toUpperCase();
      const h = (ev.home || '').trim().toUpperCase();
      const a = (ev.away || '').trim().toUpperCase();
      const key = `${sport}-${h}-${a}`;
      if (!h || !a || (sport !== 'IHO' && sport !== 'CUR')) {
        results[key] = false;
        continue;
      }
      const table = sport === 'CUR' ? 'cur_game_data' : 'iho_game_data';
      const { data: d1 } = await supabase.from(table).select('id').eq('home_team_code', h).eq('away_team_code', a).limit(1);
      const { data: d2 } = await supabase.from(table).select('id').eq('home_team_code', a).eq('away_team_code', h).limit(1);
      results[key] = (d1 && d1.length > 0) || (d2 && d2.length > 0);
    }
    res.json({ results });
  } catch (err) {
    console.error('live-has-results error:', err);
    res.status(500).json({ error: 'Failed to check results', details: err.message });
  }
}
