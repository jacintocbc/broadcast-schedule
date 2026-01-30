import { useState, useEffect } from 'react';
import moment from 'moment';
import { getBoothBlocks, getResources } from '../utils/api';
import { realtimeManager } from '../utils/realtimeManager';
import { SHARED_BOOTH_SORT_ORDER } from '../utils/boothConstants';

// Map event title to picto filename (public/picto). Order matters: more specific first.
// IHO = Ice hockey, ALP = Alpine skiing (event codes)
const PICTO_MAP = [
  ['iho', 'Ice-Hockey-Picto.png'],
  ['alp', 'Alpine-Skiing-Picto.png'],
  ['alpine', 'Alpine-Skiing-Picto.png'],
  ['biathlon', 'Biathlon-Picto.png'],
  ['bobsleigh', 'Bobsleigh-Picto.png'],
  ['cross-country', 'Cross-Country-Skiing-Picto.png'],
  ['curling', 'Curling-Picto.png'],
  ['figure skating', 'Figure-Skating-Picto.png'],
  ['freestyle', 'Freestyle-Skiing-Picto.png'],
  ['ice hockey', 'Ice-Hockey-Picto.png'],
  ['luge', 'Luge-Picto.png'],
  ['nordic combined', 'Nordic-Combined.png'],
  ['short track', 'Short-Track-Speed-Skating-Picto.png'],
  ['skeleton', 'Skeleton-Picto.png'],
  ['ski jumping', 'Ski-Jumping-Picto.png'],
  ['ski mountaineering', 'Ski-Mountaineering-Picto.png'],
  ['snowboard', 'Snowboard-Picto.png'],
  ['speed skating', 'Speed-Skating-Picto.png']
];
function getPictoPath(title) {
  if (!title || typeof title !== 'string') return '/picto/Curling-Picto.png';
  const lower = title.toLowerCase();
  for (const [key, file] of PICTO_MAP) {
    if (lower.includes(key)) return `/picto/${file}`;
  }
  return '/picto/Curling-Picto.png';
}

function BoothPage() {
  const [booths, setBooths] = useState([]);
  const [selectedBoothId, setSelectedBoothId] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBooths();
    
    // Subscribe to booths changes
    const unsubscribeBooths = realtimeManager.subscribe('booths', () => {
      loadBooths();
    });
    
    return () => {
      unsubscribeBooths();
    };
  }, []);

  useEffect(() => {
    if (selectedBoothId) {
      loadBoothBlocks();
    }
    
    // Subscribe to blocks and relationships for this booth
    if (selectedBoothId) {
      const unsubscribers = [
        realtimeManager.subscribe('blocks', () => {
          loadBoothBlocks();
        }),
        realtimeManager.subscribe('block_booths', () => {
          loadBoothBlocks();
        }),
        realtimeManager.subscribe('block_commentators', () => {
          loadBoothBlocks();
        }),
        realtimeManager.subscribe('block_networks', () => {
          loadBoothBlocks();
        }),
      ];
      
      return () => {
        unsubscribers.forEach(unsub => unsub());
      };
    }
  }, [selectedBoothId]);

  const loadBooths = async () => {
    try {
      const data = await getResources('booths');
      // Sort: VIS, VOBS, VV MH1, VV MH2, VV MOS, then VT in order, then VM in order
      const sorted = [...(data || [])].sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        const iA = SHARED_BOOTH_SORT_ORDER.indexOf(nameA);
        const iB = SHARED_BOOTH_SORT_ORDER.indexOf(nameB);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1;
        if (iB !== -1) return 1;
        if (nameA.startsWith('VT ') && nameB.startsWith('VT ')) {
          const numA = parseInt(nameA.match(/\d+/)?.[0] || '999', 10);
          const numB = parseInt(nameB.match(/\d+/)?.[0] || '999', 10);
          return numA - numB;
        }
        if (nameA.startsWith('VT ')) return -1;
        if (nameB.startsWith('VT ')) return 1;
        if (nameA.startsWith('VM ') && nameB.startsWith('VM ')) {
          const numA = parseInt(nameA.match(/\d+/)?.[0] || '999', 10);
          const numB = parseInt(nameB.match(/\d+/)?.[0] || '999', 10);
          return numA - numB;
        }
        if (nameA.startsWith('VM ')) return -1;
        if (nameB.startsWith('VM ')) return 1;
        return nameA.localeCompare(nameB);
      });
      setBooths(sorted);
      if (sorted.length > 0 && !selectedBoothId) {
        setSelectedBoothId(sorted[0].id);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error loading booths:', err);
    }
  };

  const loadBoothBlocks = async () => {
    if (!selectedBoothId) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await getBoothBlocks(selectedBoothId);
      setBlocks(data);
    } catch (err) {
      setError(err.message);
      console.error('Error loading booth blocks:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-gray-900 text-white p-6 overflow-y-auto">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold text-white">Booth Page</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-300">Select Booth:</label>
          <select
            value={selectedBoothId || ''}
            onChange={(e) => setSelectedBoothId(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gray-500 min-w-[12rem]"
          >
            <option value="">-- Select a booth --</option>
            {booths.map(booth => (
              <option key={booth.id} value={booth.id}>{booth.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-600 text-red-200 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading blocks...</div>
      ) : !selectedBoothId ? (
        <div className="text-gray-400">Please select a booth to view its blocks.</div>
      ) : blocks.length === 0 ? (
        <div className="text-gray-400">No blocks assigned to this booth.</div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => (
            <div key={block.id} className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex gap-4 items-start">
              {/* Picto 150×150 */}
              <img
                src={getPictoPath(block.name)}
                alt=""
                className="w-[150px] h-[150px] flex-shrink-0 object-contain"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white mb-1 truncate">{block.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-300">
                  {block.block_id && <span>Block ID: {block.block_id}</span>}
                  {block.obs_id && <span>OBS ID: {block.obs_id}</span>}
                  <span>
                    {moment(block.start_time).format('MMM D, YYYY HH:mm')} – {moment(block.end_time).format('HH:mm')}
                  </span>
                </div>
                {/* Single + Multiple in one row, compact */}
                <div className="flex flex-wrap gap-6 mt-3 pt-3 border-t border-gray-600">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Single</h4>
                    <div className="text-sm text-gray-300 space-y-0.5">
                      {block.encoder && <div>Encoder: {block.encoder.name}</div>}
                      {block.producer && <div>Producer: {block.producer.name}</div>}
                      {block.suite && <div>Suite: {block.suite.name}</div>}
                      {!block.encoder && !block.producer && !block.suite && (
                        <div className="text-gray-500">None</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Multiple</h4>
                    <div className="text-sm text-gray-300 space-y-0.5">
                      <div>Commentators: {block.commentators.length === 0 ? 'None' : block.commentators.map(c => `${c.name}${c.role ? ` (${c.role})` : ''}`).join(', ')}</div>
                      <div>Booths: {block.booths.length === 0 ? 'None' : block.booths.map(b => b.name).join(', ')}</div>
                      <div>Networks: {block.networks.length === 0 ? 'None' : block.networks.map(n => n.name).join(', ')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BoothPage;
