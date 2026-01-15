import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Valid relationship types
const validTypes = ['commentators', 'booths', 'networks'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Extract blockId and relationship type from URL
  // Vercel rewrite: /api/blocks/:blockId/:relationshipType -> /api/blocks/:blockId/relationships?relationshipType=:relationshipType&blockId=:blockId
  // Dynamic route: api/blocks/[blockId]/relationships.js
  // The rewrite adds both blockId and relationshipType to query params
  let blockId = req.query.blockId;
  let relationshipType = req.query.relationshipType;
  
  // Fallback: Parse from URL path if not in query
  if (!blockId || !relationshipType) {
    if (req.url) {
      const urlPath = req.url.split('?')[0];
      // Match /api/blocks/{blockId}/relationships
      const match = urlPath.match(/\/blocks\/([^/]+)\/relationships/);
      if (match && match[1] && !blockId) {
        blockId = match[1];
      }
    }
  }

  if (!blockId) {
    return res.status(400).json({ error: 'Block ID is required' });
  }

  if (!relationshipType) {
    return res.status(400).json({ error: 'Relationship type is required' });
  }

  if (!validTypes.includes(relationshipType)) {
    return res.status(400).json({ 
      error: 'Invalid relationship type',
      received: relationshipType,
      validTypes 
    });
  }

  const tableName = `block_${relationshipType}`;
  const foreignKey = `${relationshipType.slice(0, -1)}_id`; // commentators -> commentator_id
  const relatedTable = relationshipType; // commentators -> commentators

  try {
    switch (req.method) {
      case 'GET':
        // Get all relationships for a block
        const { data, error } = await supabase
          .from(tableName)
          .select(`*, ${relationshipType.slice(0, -1)}:${relatedTable}(*)`)
          .eq('block_id', blockId)
          .order('created_at');
        
        if (error) throw error;
        res.json(data || []);
        break;

      case 'POST':
        // Link relationship to block
        const bodyKey = relationshipType === 'commentators' 
          ? 'commentator_id' 
          : relationshipType === 'booths'
          ? 'booth_id'
          : 'network_id';
        
        const relationshipId = req.body[bodyKey];
        const role = req.body.role; // Only for commentators
        
        if (!relationshipId) {
          return res.status(400).json({ error: `${bodyKey} is required` });
        }

        const insertData = {
          block_id: blockId,
          [foreignKey]: relationshipId
        };
        
        if (relationshipType === 'commentators' && role) {
          insertData.role = role;
        }

        const { data: link, error: linkError } = await supabase
          .from(tableName)
          .insert([insertData])
          .select(`*, ${relationshipType.slice(0, -1)}:${relatedTable}(*)`)
          .single();
        
        if (linkError) {
          if (linkError.code === '23505') {
            return res.status(409).json({ error: `${relationshipType.slice(0, -1)} is already linked to this block` });
          }
          throw linkError;
        }
        res.status(201).json(link);
        break;

      case 'DELETE':
        // Unlink relationship from block
        const linkId = req.query.linkId;
        if (!linkId) {
          return res.status(400).json({ error: 'Link ID is required' });
        }

        const { error: deleteError } = await supabase
          .from(tableName)
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
    console.error(`Error in block ${relationshipType}:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
