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
    const eventCode = (req.query.event_code || req.query.eventCode || 'LUG').toString().trim().toUpperCase() || 'LUG';
    const { data: rows, error } = await supabase
      .from('lug_live_data')
      .select('data')
      .eq('event_code', eventCode)
      .order('last_updated', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      const { data: anyRows } = await supabase
        .from('lug_live_data')
        .select('data')
        .order('last_updated', { ascending: false })
        .limit(1);
      if (anyRows && anyRows.length > 0) {
        const stored = anyRows[0].data;
        return res.json({
          eventName: stored?.eventName,
          lastUpdated: stored?.lastUpdated,
          runs: Array.isArray(stored?.runs) ? stored.runs : []
        });
      }
      return res.status(404).json({
        error: 'No Luge live data found',
        details: 'No data synced yet from local instance'
      });
    }
    const stored = rows[0].data;
    res.json({
      eventName: stored?.eventName,
      lastUpdated: stored?.lastUpdated,
      runs: Array.isArray(stored?.runs) ? stored.runs : []
    });
  } catch (err) {
    console.error('Luge live API error:', err);
    res.status(500).json({
      error: 'Failed to load Luge live data',
      details: err.message
    });
  }
}
