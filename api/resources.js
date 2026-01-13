import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Generic CRUD handler (inlined to avoid extra function)
async function handleCRUD(tableName, req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ 
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('name');
        if (error) throw error;
        res.json(data || []);
        break;

      case 'POST':
        const { name } = req.body;
        if (!name || name.trim() === '') {
          return res.status(400).json({ error: 'Name is required' });
        }
        const { data: newItem, error: insertError } = await supabase
          .from(tableName)
          .insert([{ name: name.trim() }])
          .select()
          .single();
        if (insertError) {
          if (insertError.code === '23505') {
            return res.status(409).json({ error: `${tableName.slice(0, -1)} with this name already exists` });
          }
          throw insertError;
        }
        res.status(201).json(newItem);
        break;

      case 'PUT':
        const { id, name: updatedName } = req.body;
        if (!id) {
          return res.status(400).json({ error: 'ID is required' });
        }
        if (!updatedName || updatedName.trim() === '') {
          return res.status(400).json({ error: 'Name is required' });
        }
        const { data: updated, error: updateError } = await supabase
          .from(tableName)
          .update({ name: updatedName.trim() })
          .eq('id', id)
          .select()
          .single();
        if (updateError) {
          if (updateError.code === '23505') {
            return res.status(409).json({ error: `${tableName.slice(0, -1)} with this name already exists` });
          }
          throw updateError;
        }
        if (!updated) {
          return res.status(404).json({ error: `${tableName.slice(0, -1)} not found` });
        }
        res.json(updated);
        break;

      case 'DELETE':
        const deleteId = req.query.id;
        if (!deleteId) {
          return res.status(400).json({ error: 'ID is required' });
        }
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', deleteId);
        if (deleteError) throw deleteError;
        res.status(204).end();
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`Error in ${tableName} CRUD:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Valid resource types
const validTypes = ['commentators', 'producers', 'encoders', 'booths', 'suites', 'networks'];

export default async function handler(req, res) {
  // Parse resource type from URL
  // Vercel rewrite converts /api/resources/{type} to /api/resources?type={type}
  let resourceType = req.query?.type;
  
  // Fallback: Parse from URL path if query param not available
  if (!resourceType && req.url) {
    const urlPath = req.url.split('?')[0];
    const match = urlPath.match(/\/resources\/([^/]+)$/);
    if (match && match[1]) {
      resourceType = match[1];
    }
  }
  
  if (!resourceType) {
    return res.status(400).json({ 
      error: 'Resource type is required',
      url: req.url,
      query: req.query,
      hint: 'Use /api/resources/{type} where type is one of: ' + validTypes.join(', ')
    });
  }
  
  if (!validTypes.includes(resourceType)) {
    return res.status(400).json({ 
      error: 'Invalid resource type',
      received: resourceType,
      validTypes 
    });
  }
  
  return handleCRUD(resourceType, req, res);
}
