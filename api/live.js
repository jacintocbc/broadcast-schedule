import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const CONFIG = {
  iho: { table: 'iho_game_data', label: 'IHO' },
  cur: { table: 'cur_game_data', label: 'Curling' },
  lug: { table: 'lug_live_data', label: 'Luge' },
  ssk: { table: 'ssk_live_data', label: 'Speed Skating' },
  stk: { table: 'stk_live_data', label: 'Short Track Speed Skating' },
  sbd: { table: 'sbd_live_data', label: 'Snowboard' }
};

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

  const type = (req.query.type || 'iho').toLowerCase();
  const cfg = CONFIG[type] || CONFIG.iho;

  try {
    // Medal alerts: return today's Canadian medals from Supabase
    if (type === 'medals') {
      const today = new Date().toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from('medal_alerts')
        .select('*')
        .eq('event_date', today);
      if (error) throw error;
      return res.json({ medals: rows || [] });
    }

    // IHO Game Detail: full boxscore from iho_game_detail table
    if (type === 'iho-game-detail') {
      const home = req.query.home?.trim()?.toUpperCase();
      const away = req.query.away?.trim()?.toUpperCase();
      if (!home || !away) {
        return res.status(400).json({ error: 'home and away query params required' });
      }
      const { data: d1, error: e1 } = await supabase
        .from('iho_game_detail')
        .select('data')
        .eq('home_team_code', home)
        .eq('away_team_code', away)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const { data: d2, error: e2 } = await supabase
        .from('iho_game_detail')
        .select('data')
        .eq('home_team_code', away)
        .eq('away_team_code', home)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      const rows = (d1?.length > 0) ? d1 : (d2?.length > 0) ? d2 : null;
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: `No game detail for ${home} vs ${away}` });
      }
      return res.json(rows[0].data);
    }

    // CUR Game Detail: full boxscore from cur_game_detail table
    if (type === 'cur-game-detail') {
      const home = req.query.home?.trim()?.toUpperCase();
      const away = req.query.away?.trim()?.toUpperCase();
      if (!home || !away) {
        return res.status(400).json({ error: 'home and away query params required' });
      }
      const { data: d1, error: e1 } = await supabase
        .from('cur_game_detail')
        .select('data')
        .eq('home_team_code', home)
        .eq('away_team_code', away)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const { data: d2, error: e2 } = await supabase
        .from('cur_game_detail')
        .select('data')
        .eq('home_team_code', away)
        .eq('away_team_code', home)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      const rows = (d1?.length > 0) ? d1 : (d2?.length > 0) ? d2 : null;
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: `No game detail for ${home} vs ${away}` });
      }
      return res.json(rows[0].data);
    }

    // CUR PBP Images: individual stone sheet images
    if (type === 'cur-pbp-images') {
      const home = req.query.home?.trim()?.toUpperCase();
      const away = req.query.away?.trim()?.toUpperCase();
      const date = req.query.date?.trim();
      if (!home || !away || !date) {
        return res.status(400).json({ error: 'home, away, and date query params required' });
      }
      const key1 = `${home}-${away}_${date}`;
      const key2 = `${away}-${home}_${date}`;
      const { data: d1, error: e1 } = await supabase
        .from('cur_pbp_images')
        .select('end_num,stone_num,image_data')
        .eq('game_key', key1);
      if (e1) throw e1;
      const { data: d2, error: e2 } = await supabase
        .from('cur_pbp_images')
        .select('end_num,stone_num,image_data')
        .eq('game_key', key2);
      if (e2) throw e2;
      const images = (d1?.length > 0) ? d1 : (d2?.length > 0) ? d2 : [];
      return res.json({ images });
    }

    if (type === 'lug' || type === 'ssk' || type === 'stk' || type === 'sbd') {
      const defaultCode = type === 'lug' ? 'LUG' : type === 'ssk' ? 'SSK' : type === 'stk' ? 'STK' : 'SBD';
      const eventCode = (req.query.event_code || req.query.eventCode || defaultCode).toString().trim().toUpperCase() || defaultCode;
      const { data: rows, error } = await supabase
        .from(cfg.table)
        .select('data')
        .eq('event_code', eventCode)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!rows || rows.length === 0) {
        const { data: anyRows } = await supabase
          .from(cfg.table)
          .select('data')
          .order('last_updated', { ascending: false })
          .limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          // SBD needs full blob (phaseResults, runSchedule); others use simplified shape
          if (type === 'sbd') return res.json(stored);
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        return res.status(404).json({
          error: `No ${cfg.label} live data found`,
          details: 'No data synced yet from local instance'
        });
      }
      const stored = rows[0].data;
      // SBD needs full blob (phaseResults, runSchedule); others use simplified shape
      if (type === 'sbd') return res.json(stored);
      return res.json({
        eventCode: eventCode,
        eventName: stored?.eventName,
        lastUpdated: stored?.lastUpdated,
        runs: Array.isArray(stored?.runs) ? stored.runs : []
      });
    }

    const home = req.query.home?.trim()?.toUpperCase();
    const away = req.query.away?.trim()?.toUpperCase();
    const hasTeamFilter = home && away;

    let rows = null;
    if (hasTeamFilter) {
      const { data: d1, error: e1 } = await supabase
        .from(cfg.table)
        .select('data')
        .eq('home_team_code', home)
        .eq('away_team_code', away)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const { data: d2, error: e2 } = await supabase
        .from(cfg.table)
        .select('data')
        .eq('home_team_code', away)
        .eq('away_team_code', home)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      rows = (d1?.length > 0) ? d1 : (d2?.length > 0) ? d2 : null;
    } else {
      const { data, error } = await supabase
        .from(cfg.table)
        .select('data')
        .order('last_updated', { ascending: false })
        .limit(1);
      if (error) throw error;
      rows = data;
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        error: `No ${cfg.label} game data found`,
        details: hasTeamFilter ? `No data for ${home} vs ${away}` : 'No games synced yet'
      });
    }
    res.json(rows[0].data);
  } catch (err) {
    console.error(`${cfg.label} live API error:`, err);
    res.status(500).json({
      error: `Failed to load ${cfg.label} live data`,
      details: err.message
    });
  }
}
