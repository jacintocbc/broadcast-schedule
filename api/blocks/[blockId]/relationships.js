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
        // For booths, also include network relationship
        const selectFields = relationshipType === 'booths'
          ? `*, ${relationshipType.slice(0, -1)}:${relatedTable}(*), network:networks(*)`
          : `*, ${relationshipType.slice(0, -1)}:${relatedTable}(*)`;
        
        const { data, error } = await supabase
          .from(tableName)
          .select(selectFields)
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
        const networkId = req.body.network_id; // For booths, we need to know which network
        
        if (!relationshipId) {
          return res.status(400).json({ error: `${bodyKey} is required` });
        }

        // For booths: require network_id to associate booth with a specific network
        if (relationshipType === 'booths' && !networkId) {
          return res.status(400).json({ error: 'network_id is required when adding a booth relationship' });
        }

        const insertData = {
          block_id: blockId,
          [foreignKey]: relationshipId
        };
        
        if (relationshipType === 'commentators' && role) {
          insertData.role = role;
        }
        
        // For booths, include network_id to allow same booth for different networks
        if (relationshipType === 'booths' && networkId) {
          insertData.network_id = networkId;
        }

        // For booths, also include network in the select
        const selectFieldsForInsert = relationshipType === 'booths'
          ? `*, ${relationshipType.slice(0, -1)}:${relatedTable}(*), network:networks(*)`
          : `*, ${relationshipType.slice(0, -1)}:${relatedTable}(*)`;

        const { data: link, error: linkError } = await supabase
          .from(tableName)
          .insert([insertData])
          .select(selectFieldsForInsert)
          .single();
        
        if (linkError) {
          console.error('Supabase insert error:', {
            code: linkError.code,
            message: linkError.message,
            details: linkError.details,
            hint: linkError.hint,
            relationshipType,
            insertData
          });
          
          if (linkError.code === '23505') {
            // Duplicate key error - relationship already exists
            // For booths with network_id, check if this exact combination exists
            if (relationshipType === 'booths' && networkId) {
              try {
                const { data: existingLink, error: fetchError } = await supabase
                  .from(tableName)
                  .select(selectFieldsForInsert)
                  .eq('block_id', blockId)
                  .eq(foreignKey, relationshipId)
                  .eq('network_id', networkId)
                  .single();
                
                if (existingLink && !fetchError) {
                  return res.status(200).json(existingLink);
                }
              } catch (fetchErr) {
                // Continue to return 409
              }
            } else {
              // For non-booth relationships, try to fetch existing
              try {
                const { data: existingLink, error: fetchError } = await supabase
                  .from(tableName)
                  .select(selectFieldsForInsert)
                  .eq('block_id', blockId)
                  .eq(foreignKey, relationshipId)
                  .single();
                
                if (existingLink && !fetchError) {
                  return res.status(200).json(existingLink);
                }
              } catch (fetchErr) {
                // Continue to return 409
              }
            }
            return res.status(409).json({ error: `${relationshipType.slice(0, -1)} is already linked to this block${relationshipType === 'booths' ? ' for this network' : ''}` });
          }
          console.error('Error adding relationship:', linkError);
          return res.status(500).json({ error: linkError.message || 'Failed to add relationship' });
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
