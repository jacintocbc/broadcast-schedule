import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

function setCors(res, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  const {
    schedule_date,
    venue_id,
    title,
    start_time,
    end_time,
    field_crew,
    panel_tech,
    panel_talent,
    unicamx1,
    unicamx2,
    notes,
    staff_ids
  } = req.body || {};
  return {
    schedule_date,
    venue_id,
    title: title != null ? String(title).trim() : '',
    start_time,
    end_time,
    field_crew: Boolean(field_crew),
    panel_tech: Boolean(panel_tech),
    panel_talent: Boolean(panel_talent),
    unicamx1: Boolean(unicamx1),
    unicamx2: Boolean(unicamx2),
    notes: notes != null ? String(notes).trim() : null,
    staff_ids: Array.isArray(staff_ids) ? staff_ids : []
  };
}

async function handleVenues(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { data, error } = await supabase
      .from('schedule_venues')
      .select('id, key, label, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error in schedule-venues:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleBlocks(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  try {
    switch (req.method) {
      case 'GET': {
        const date = req.query.date;
        if (!date) {
          return res.status(400).json({ error: 'Query parameter date (YYYY-MM-DD) is required' });
        }
        const { data: blocks, error: blocksError } = await supabase
          .from('schedule_blocks')
          .select(`*, venue:schedule_venues(id, key, label, sort_order)`)
          .eq('schedule_date', date)
          .order('start_time');
        if (blocksError) throw blocksError;
        const blockIds = (blocks || []).map((b) => b.id);
        let staffLinks = [];
        if (blockIds.length > 0) {
          const { data: links, error: linksError } = await supabase
            .from('schedule_block_staff')
            .select('schedule_block_id, staff_id, staff:staff(id, name)')
            .in('schedule_block_id', blockIds);
          if (linksError) throw linksError;
          staffLinks = links || [];
        }
        const staffByBlock = {};
        staffLinks.forEach((link) => {
          const bid = link.schedule_block_id;
          if (!staffByBlock[bid]) staffByBlock[bid] = [];
          if (link.staff?.id) staffByBlock[bid].push({ id: link.staff.id, name: link.staff.name });
        });
        const result = (blocks || []).map((b) => {
          const venue = b.venue || b.schedule_venues;
          return { ...b, venue_id: b.venue_id, venue_key: venue?.key ?? null, venue_label: venue?.label ?? null, staff: staffByBlock[b.id] || [] };
        });
        return res.json(result);
      }
      case 'POST': {
        const body = parseBody(req);
        if (!body.schedule_date || !body.venue_id || body.title === undefined) {
          return res.status(400).json({ error: 'schedule_date, venue_id, and title are required' });
        }
        if (!body.start_time || !body.end_time) {
          return res.status(400).json({ error: 'start_time and end_time are required' });
        }
        if (new Date(body.start_time) >= new Date(body.end_time)) {
          return res.status(400).json({ error: 'end_time must be after start_time' });
        }
        const { data: newBlock, error: insertError } = await supabase
          .from('schedule_blocks')
          .insert([{
            schedule_date: body.schedule_date,
            venue_id: body.venue_id,
            title: body.title,
            start_time: body.start_time,
            end_time: body.end_time,
            field_crew: body.field_crew,
            panel_tech: body.panel_tech,
            panel_talent: body.panel_talent,
            unicamx1: body.unicamx1,
            unicamx2: body.unicamx2,
            notes: body.notes || null
          }])
          .select()
          .single();
        if (insertError) throw insertError;
        if (body.staff_ids.length > 0) {
          await supabase.from('schedule_block_staff').insert(
            body.staff_ids.map((staff_id) => ({ schedule_block_id: newBlock.id, staff_id }))
          );
        }
        const { data: staffRows } = await supabase.from('schedule_block_staff').select('staff:staff(id, name)').eq('schedule_block_id', newBlock.id);
        const staff = (staffRows || []).filter((r) => r.staff?.id).map((r) => ({ id: r.staff.id, name: r.staff.name }));
        return res.status(201).json({ ...newBlock, staff });
      }
      case 'PUT': {
        const id = req.body?.id;
        if (!id) return res.status(400).json({ error: 'id is required' });
        const body = parseBody(req);
        if (!body.schedule_date || !body.venue_id || body.title === undefined) {
          return res.status(400).json({ error: 'schedule_date, venue_id, and title are required' });
        }
        if (!body.start_time || !body.end_time) {
          return res.status(400).json({ error: 'start_time and end_time are required' });
        }
        if (new Date(body.start_time) >= new Date(body.end_time)) {
          return res.status(400).json({ error: 'end_time must be after start_time' });
        }
        const { data: updated, error: updateError } = await supabase
          .from('schedule_blocks')
          .update({
            schedule_date: body.schedule_date,
            venue_id: body.venue_id,
            title: body.title,
            start_time: body.start_time,
            end_time: body.end_time,
            field_crew: body.field_crew,
            panel_tech: body.panel_tech,
            panel_talent: body.panel_talent,
            unicamx1: body.unicamx1,
            unicamx2: body.unicamx2,
            notes: body.notes || null
          })
          .eq('id', id)
          .select()
          .single();
        if (updateError) throw updateError;
        if (!updated) return res.status(404).json({ error: 'Schedule block not found' });
        await supabase.from('schedule_block_staff').delete().eq('schedule_block_id', id);
        if (body.staff_ids.length > 0) {
          await supabase.from('schedule_block_staff').insert(
            body.staff_ids.map((staff_id) => ({ schedule_block_id: id, staff_id }))
          );
        }
        const { data: staffRows } = await supabase.from('schedule_block_staff').select('staff:staff(id, name)').eq('schedule_block_id', id);
        const staff = (staffRows || []).filter((r) => r.staff?.id).map((r) => ({ id: r.staff.id, name: r.staff.name }));
        return res.json({ ...updated, staff });
      }
      case 'DELETE': {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: 'id is required' });
        const { error: deleteError } = await supabase.from('schedule_blocks').delete().eq('id', id);
        if (deleteError) throw deleteError;
        return res.status(204).end();
      }
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in schedule-blocks:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Database configuration missing', details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set' });
  }
  const endpoint = req.query.endpoint || 'blocks';
  if (endpoint === 'venues') return handleVenues(req, res);
  return handleBlocks(req, res);
}
