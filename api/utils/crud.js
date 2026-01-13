import { supabase } from '../db.js';

/**
 * Generic CRUD handler for simple reference tables
 * @param {string} tableName - Name of the table
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
export async function handleCRUD(tableName, req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ 
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set'
    });
  }

  try {

    switch (req.method) {
      case 'GET':
        // Get all items
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('name');
        
        if (error) {
          console.error(`Supabase error in ${tableName} GET:`, error);
          throw error;
        }
        res.json(data || []);
        break;

      case 'POST':
        // Create new item
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
          if (insertError.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: `${tableName.slice(0, -1)} with this name already exists` });
          }
          throw insertError;
        }
        res.status(201).json(newItem);
        break;

      case 'PUT':
        // Update item
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
        // Delete item
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
