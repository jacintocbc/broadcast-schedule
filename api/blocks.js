import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check Supabase connection
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ 
      error: 'Database configuration missing',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get all blocks with relationships
        const blockId = req.query.id;
        
        if (blockId) {
          // Get single block with all relationships
          const { data: block, error: blockError } = await supabase
            .from('blocks')
            .select(`
              *,
              encoder:encoders(*),
              producer:producers(*),
              suite:suites(*)
            `)
            .eq('id', blockId)
            .single();
          
          if (blockError) throw blockError;
          if (!block) {
            return res.status(404).json({ error: 'Block not found' });
          }

          // Get multiple relationships
          const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
            supabase
              .from('block_commentators')
              .select('*, commentator:commentators(*)')
              .eq('block_id', blockId),
            supabase
              .from('block_booths')
              .select('*, booth:booths(*), network:networks(*)')
              .eq('block_id', blockId),
            supabase
              .from('block_networks')
              .select('*, network:networks(*)')
              .eq('block_id', blockId)
          ]);

          const blockData = {
            ...block,
            commentators: commentatorsRes.data?.map(c => ({
              id: c.commentator.id,
              name: c.commentator.name,
              role: c.role
            })) || [],
            booths: boothsRes.data?.map(b => ({
              id: b.booth.id,
              name: b.booth.name,
              network_id: b.network_id,
              network: b.network ? {
                id: b.network.id,
                name: b.network.name
              } : null
            })) || [],
            networks: networksRes.data?.map(n => ({
              id: n.network.id,
              name: n.network.name
            })) || []
          };

          res.json(blockData);
        } else {
          // Get all blocks with relationships
          const { data: blocks, error: blocksError } = await supabase
            .from('blocks')
            .select(`
              *,
              encoder:encoders(*),
              producer:producers(*),
              suite:suites(*)
            `)
            .order('start_time');
          
          if (blocksError) throw blocksError;

          // For each block, get multiple relationships
          const blocksWithRelations = await Promise.all(
            (blocks || []).map(async (block) => {
              const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
                supabase
                  .from('block_commentators')
                  .select('*, commentator:commentators(*)')
                  .eq('block_id', block.id),
                supabase
                  .from('block_booths')
                  .select('*, booth:booths(*), network:networks(*)')
                  .eq('block_id', block.id),
                supabase
                  .from('block_networks')
                  .select('*, network:networks(*)')
                  .eq('block_id', block.id)
              ]);

              return {
                ...block,
                commentators: commentatorsRes.data?.map(c => ({
                  id: c.commentator.id,
                  name: c.commentator.name,
                  role: c.role
                })) || [],
                booths: boothsRes.data?.map(b => ({
                  id: b.booth.id,
                  name: b.booth.name,
                  network_id: b.network_id,
                  network: b.network ? {
                    id: b.network.id,
                    name: b.network.name
                  } : null
                })) || [],
                networks: networksRes.data?.map(n => ({
                  id: n.network.id,
                  name: n.network.name
                })) || []
              };
            })
          );

          res.json(blocksWithRelations);
        }
        break;

      case 'POST':
        // Create new block
        const { 
          name, 
          block_id, 
          obs_id, 
          start_time, 
          end_time, 
          broadcast_start_time,
          broadcast_end_time,
          duration,
          encoder_id,
          producer_id,
          suite_id,
          source_event_id,
          obs_group,
          type,
          canadian_content
        } = req.body;

        if (!name || !start_time || !end_time) {
          return res.status(400).json({ error: 'Name, start_time, and end_time are required' });
        }

        // Calculate duration if not provided
        let calculatedDuration = duration;
        if (!calculatedDuration && start_time && end_time) {
          const start = new Date(start_time);
          const end = new Date(end_time);
          const diffMs = end - start;
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
          calculatedDuration = `${hours}:${minutes}:${seconds}`;
        }

        const { data: newBlock, error: insertError } = await supabase
          .from('blocks')
          .insert([{
            name: name.trim(),
            block_id: block_id?.trim() || null,
            obs_id: obs_id?.trim() || null,
            start_time,
            end_time,
            broadcast_start_time: broadcast_start_time || null,
            broadcast_end_time: broadcast_end_time || null,
            duration: calculatedDuration,
            encoder_id: encoder_id || null,
            producer_id: producer_id || null,
            suite_id: suite_id || null,
            source_event_id: source_event_id || null,
            obs_group: obs_group?.trim() || null,
            type: type && type.trim() ? type.trim() : null,
            canadian_content: canadian_content === true || canadian_content === 'true'
          }])
          .select()
          .single();
        
        if (insertError) throw insertError;
        res.status(201).json(newBlock);
        break;

      case 'PUT':
        // Update block
        const { 
          id, 
          name: updatedName, 
          block_id: updatedBlockId, 
          obs_id: updatedObsId, 
          start_time: updatedStartTime, 
          end_time: updatedEndTime,
          broadcast_start_time: updatedBroadcastStartTime,
          broadcast_end_time: updatedBroadcastEndTime,
          duration: updatedDuration,
          encoder_id: updatedEncoderId,
          producer_id: updatedProducerId,
          suite_id: updatedSuiteId,
          source_event_id: updatedSourceEventId,
          obs_group: updatedObsGroup,
          type: updatedType,
          canadian_content: updatedCanadianContent
        } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'ID is required' });
        }

        // Calculate duration if not provided but times are
        let calcDuration = updatedDuration;
        if (!calcDuration && updatedStartTime && updatedEndTime) {
          const start = new Date(updatedStartTime);
          const end = new Date(updatedEndTime);
          const diffMs = end - start;
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
          calcDuration = `${hours}:${minutes}:${seconds}`;
        }

        const updateData = {};
        if (updatedName !== undefined) updateData.name = updatedName.trim();
        if (updatedBlockId !== undefined) updateData.block_id = updatedBlockId?.trim() || null;
        if (updatedObsId !== undefined) updateData.obs_id = updatedObsId?.trim() || null;
        if (updatedStartTime !== undefined) updateData.start_time = updatedStartTime;
        if (updatedEndTime !== undefined) updateData.end_time = updatedEndTime;
        if (updatedBroadcastStartTime !== undefined) updateData.broadcast_start_time = updatedBroadcastStartTime || null;
        if (updatedBroadcastEndTime !== undefined) updateData.broadcast_end_time = updatedBroadcastEndTime || null;
        if (calcDuration !== undefined) updateData.duration = calcDuration;
        if (updatedEncoderId !== undefined) updateData.encoder_id = updatedEncoderId || null;
        if (updatedProducerId !== undefined) updateData.producer_id = updatedProducerId || null;
        if (updatedSuiteId !== undefined) updateData.suite_id = updatedSuiteId || null;
        if (updatedSourceEventId !== undefined) updateData.source_event_id = updatedSourceEventId || null;
        if (updatedObsGroup !== undefined) updateData.obs_group = updatedObsGroup?.trim() || null;
        if (updatedType !== undefined) updateData.type = updatedType?.trim() || null;
        if (updatedCanadianContent !== undefined) updateData.canadian_content = updatedCanadianContent === true || updatedCanadianContent === 'true';

        const { data: updated, error: updateError } = await supabase
          .from('blocks')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (updateError) throw updateError;
        if (!updated) {
          return res.status(404).json({ error: 'Block not found' });
        }
        
        res.json(updated);
        break;

      case 'DELETE':
        // Delete block
        const deleteId = req.query.id;
        if (!deleteId) {
          return res.status(400).json({ error: 'ID is required' });
        }

        const { error: deleteError } = await supabase
          .from('blocks')
          .delete()
          .eq('id', deleteId);
        
        if (deleteError) throw deleteError;
        res.status(204).end();
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in blocks CRUD:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
