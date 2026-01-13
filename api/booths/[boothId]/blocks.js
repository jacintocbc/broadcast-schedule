import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Vercel dynamic routes: parameter is in req.query with the bracket name
  const boothId = req.query.boothId || req.query['[boothId]'];

  if (!boothId) {
    return res.status(400).json({ error: 'Booth ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Get all blocks for a specific booth with all relationships
      const { data: blockBooths, error: blockBoothsError } = await supabase
        .from('block_booths')
        .select('block_id')
        .eq('booth_id', boothId);
      
      if (blockBoothsError) throw blockBoothsError;

      if (!blockBooths || blockBooths.length === 0) {
        return res.json([]);
      }

      const blockIds = blockBooths.map(bb => bb.block_id);

      // Get blocks with single relationships
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select(`
          *,
          encoder:encoders(*),
          producer:producers(*),
          suite:suites(*)
        `)
        .in('id', blockIds)
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
              .select('*, booth:booths(*)')
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
              name: b.booth.name
            })) || [],
            networks: networksRes.data?.map(n => ({
              id: n.network.id,
              name: n.network.name
            })) || []
          };
        })
      );

      res.json(blocksWithRelations);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in booth blocks:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
