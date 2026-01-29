import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getPlanning(res) {
  if (!supabase) {
    return res.status(500).json({
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables'
    });
  }
  const { data: rows, error } = await supabase
    .from('planning')
    .select('block_id, producer_broadcast_start_time, producer_broadcast_end_time, notes, sort_order')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('Error reading planning:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
  const onAirBlockIds = (rows || []).map(r => r.block_id);
  const overrides = (rows || []).reduce((acc, r) => {
    acc[r.block_id] = {
      producer_broadcast_start_time: r.producer_broadcast_start_time || undefined,
      producer_broadcast_end_time: r.producer_broadcast_end_time || undefined,
      notes: r.notes || undefined
    };
    return acc;
  }, {});
  return res.json({ onAirBlockIds, overrides });
}

async function putPlanning(req, res) {
  if (!supabase) {
    return res.status(500).json({
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables'
    });
  }
  const { onAirBlockIds, overrides } = req.body || {};
  const ids = Array.isArray(onAirBlockIds) ? onAirBlockIds : [];
  const overridesObj = overrides && typeof overrides === 'object' ? overrides : {};

  const { error: deleteError } = await supabase
    .from('planning')
    .delete()
    .neq('block_id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) {
    console.error('Error deleting planning:', deleteError);
    return res.status(500).json({ error: deleteError.message || 'Internal server error' });
  }

  if (ids.length > 0) {
    const insertRows = ids.map((block_id, i) => {
      const o = overridesObj[block_id] || {};
      return {
        block_id,
        producer_broadcast_start_time: o.producer_broadcast_start_time || null,
        producer_broadcast_end_time: o.producer_broadcast_end_time || null,
        notes: o.notes || null,
        sort_order: i
      };
    });
    const { error: insertError } = await supabase
      .from('planning')
      .upsert(insertRows, { onConflict: 'block_id' });
    if (insertError) {
      console.error('Error upserting planning:', insertError);
      return res.status(500).json({ error: insertError.message || 'Internal server error' });
    }
  }

  const { data: rows, error: selectError } = await supabase
    .from('planning')
    .select('block_id, producer_broadcast_start_time, producer_broadcast_end_time, notes, sort_order')
    .order('sort_order', { ascending: true });
  if (selectError) {
    console.error('Error reading planning after write:', selectError);
    return res.status(500).json({ error: selectError.message || 'Internal server error' });
  }
  const nextIds = (rows || []).map(r => r.block_id);
  const nextOverrides = (rows || []).reduce((acc, r) => {
    acc[r.block_id] = {
      producer_broadcast_start_time: r.producer_broadcast_start_time || undefined,
      producer_broadcast_end_time: r.producer_broadcast_end_time || undefined,
      notes: r.notes || undefined
    };
    return acc;
  }, {});
  return res.json({ onAirBlockIds: nextIds, overrides: nextOverrides });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') {
    return getPlanning(res);
  }
  if (req.method === 'PUT') {
    return putPlanning(req, res);
  }
  res.status(405).json({ error: 'Method not allowed' });
}
