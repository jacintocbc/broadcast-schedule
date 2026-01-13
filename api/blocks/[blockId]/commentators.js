import { supabase } from '../../db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Vercel dynamic routes: parameter is in req.query with the bracket name
  const blockId = req.query.blockId || req.query['[blockId]'];

  if (!blockId) {
    return res.status(400).json({ error: 'Block ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get all commentators for a block
        const { data, error } = await supabase
          .from('block_commentators')
          .select('*, commentator:commentators(*)')
          .eq('block_id', blockId)
          .order('created_at');
        
        if (error) throw error;
        res.json(data || []);
        break;

      case 'POST':
        // Link commentator to block
        const { commentator_id, role } = req.body;
        
        if (!commentator_id) {
          return res.status(400).json({ error: 'Commentator ID is required' });
        }

        const { data: link, error: linkError } = await supabase
          .from('block_commentators')
          .insert([{
            block_id: blockId,
            commentator_id,
            role: role || null
          }])
          .select('*, commentator:commentators(*)')
          .single();
        
        if (linkError) {
          if (linkError.code === '23505') {
            return res.status(409).json({ error: 'Commentator is already linked to this block' });
          }
          throw linkError;
        }
        res.status(201).json(link);
        break;

      case 'DELETE':
        // Unlink commentator from block
        const linkId = req.query.linkId;
        if (!linkId) {
          return res.status(400).json({ error: 'Link ID is required' });
        }

        const { error: deleteError } = await supabase
          .from('block_commentators')
          .delete()
          .eq('id', linkId)
          .eq('block_id', blockId);
        
        if (deleteError) throw deleteError;
        res.status(204).end();
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in block commentators:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
