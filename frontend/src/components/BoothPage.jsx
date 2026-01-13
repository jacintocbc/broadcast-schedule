import { useState, useEffect } from 'react';
import moment from 'moment';
import { getBoothBlocks, getResources } from '../utils/api';

function BoothPage() {
  const [booths, setBooths] = useState([]);
  const [selectedBoothId, setSelectedBoothId] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBooths();
  }, []);

  useEffect(() => {
    if (selectedBoothId) {
      loadBoothBlocks();
    }
  }, [selectedBoothId]);

  const loadBooths = async () => {
    try {
      const data = await getResources('booths');
      setBooths(data);
      if (data.length > 0 && !selectedBoothId) {
        setSelectedBoothId(data[0].id);
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
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Booth Page</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Booth:</label>
        <select
          value={selectedBoothId || ''}
          onChange={(e) => setSelectedBoothId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select a booth --</option>
          {booths.map(booth => (
            <option key={booth.id} value={booth.id}>{booth.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading blocks...</div>
      ) : !selectedBoothId ? (
        <div className="text-gray-500">Please select a booth to view its blocks.</div>
      ) : blocks.length === 0 ? (
        <div className="text-gray-500">No blocks assigned to this booth.</div>
      ) : (
        <div className="space-y-4">
          {blocks.map((block) => (
            <div key={block.id} className="bg-white p-6 rounded-lg shadow">
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">{block.name}</h3>
                {block.block_id && <p className="text-sm text-gray-600">Block ID: {block.block_id}</p>}
                {block.obs_id && <p className="text-sm text-gray-600">OBS ID: {block.obs_id}</p>}
                <p className="text-sm text-gray-600">
                  {moment(block.start_time).format('MMM D, YYYY HH:mm')} - {moment(block.end_time).format('HH:mm')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Single Assignments</h4>
                  <ul className="space-y-1 text-sm">
                    {block.encoder && <li>Encoder: {block.encoder.name}</li>}
                    {block.producer && <li>Producer: {block.producer.name}</li>}
                    {block.suite && <li>Suite: {block.suite.name}</li>}
                    {!block.encoder && !block.producer && !block.suite && (
                      <li className="text-gray-400">None assigned</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Multiple Assignments</h4>
                  <ul className="space-y-1 text-sm">
                    <li>
                      Commentators: {block.commentators.length === 0 ? 'None' : (
                        <ul className="ml-4 mt-1">
                          {block.commentators.map(c => (
                            <li key={c.id}>
                              {c.name} {c.role && `(${c.role})`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                    <li>
                      Booths: {block.booths.length === 0 ? 'None' : block.booths.map(b => b.name).join(', ')}
                    </li>
                    <li>
                      Networks: {block.networks.length === 0 ? 'None' : block.networks.map(n => n.name).join(', ')}
                    </li>
                  </ul>
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
