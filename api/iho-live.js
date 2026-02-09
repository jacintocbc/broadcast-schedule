import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables'
    });
  }

  try {
    const home = req.query.home?.trim()?.toUpperCase();
    const away = req.query.away?.trim()?.toUpperCase();
    const hasTeamFilter = home && away;

    let rows = null;

    if (hasTeamFilter) {
      const { data: d1, error: e1 } = await supabase
        .from('iho_game_data')
        .select('data')
        .eq('home_team_code', home)
        .eq('away_team_code', away)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const { data: d2, error: e2 } = await supabase
        .from('iho_game_data')
        .select('data')
        .eq('home_team_code', away)
        .eq('away_team_code', home)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      rows = (d1 && d1.length > 0) ? d1 : (d2 && d2.length > 0) ? d2 : null;
    } else {
      const { data, error } = await supabase
        .from('iho_game_data')
        .select('data')
        .order('last_updated', { ascending: false })
        .limit(1);
      if (error) throw error;
      rows = data;
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        error: 'No IHO game data found',
        details: hasTeamFilter ? `No data for ${home} vs ${away}` : 'No games synced yet'
      });
    }

    const payload = rows[0].data;
    res.json(payload);
  } catch (err) {
    console.error('IHO live API error:', err);
    res.status(500).json({
      error: 'Failed to load IHO live data',
      details: err.message
    });
  }
}
