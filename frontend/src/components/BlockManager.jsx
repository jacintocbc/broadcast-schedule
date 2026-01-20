import { useState, useEffect } from 'react';
import moment from 'moment';
import { 
  getBlocks, 
  createBlock, 
  updateBlock, 
  deleteBlock,
  getResources,
  getBlockRelationships,
  addBlockRelationship,
  removeBlockRelationship
} from '../utils/api';
import { realtimeManager } from '../utils/realtimeManager';

function BlockManager() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    block_id: '',
    obs_id: '',
    start_time: '',
    end_time: '',
    encoder_id: '',
    producer_id: '',
    suite_id: ''
  });

  // Reference data
  const [encoders, setEncoders] = useState([]);
  const [producers, setProducers] = useState([]);
  const [suites, setSuites] = useState([]);
  const [commentators, setCommentators] = useState([]);
  const [booths, setBooths] = useState([]);
  const [networks, setNetworks] = useState([]);

  // Block relationships
  const [blockRelationships, setBlockRelationships] = useState({});

  useEffect(() => {
    loadBlocks();
    loadReferenceData();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const unsubscribers = [
      // Subscribe to blocks
      realtimeManager.subscribe('blocks', () => {
        loadBlocks();
      }),
      // Subscribe to block relationships
      realtimeManager.subscribe('block_booths', () => {
        loadBlocks();
      }),
      realtimeManager.subscribe('block_commentators', () => {
        loadBlocks();
      }),
      realtimeManager.subscribe('block_networks', () => {
        loadBlocks();
      }),
      // Subscribe to resources
      realtimeManager.subscribe('encoders', () => {
        getResources('encoders').then(setEncoders).catch(console.error);
      }),
      realtimeManager.subscribe('producers', () => {
        getResources('producers').then(setProducers).catch(console.error);
      }),
      realtimeManager.subscribe('suites', () => {
        getResources('suites').then(setSuites).catch(console.error);
      }),
      realtimeManager.subscribe('commentators', () => {
        getResources('commentators').then(setCommentators).catch(console.error);
      }),
      realtimeManager.subscribe('booths', () => {
        getResources('booths').then(setBooths).catch(console.error);
      }),
      realtimeManager.subscribe('networks', () => {
        getResources('networks').then(setNetworks).catch(console.error);
      }),
    ];
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  const loadReferenceData = async () => {
    try {
      const [encodersData, producersData, suitesData, commentatorsData, boothsData, networksData] = await Promise.all([
        getResources('encoders'),
        getResources('producers'),
        getResources('suites'),
        getResources('commentators'),
        getResources('booths'),
        getResources('networks')
      ]);
      setEncoders(encodersData);
      setProducers(producersData);
      setSuites(suitesData);
      setCommentators(commentatorsData);
      setBooths(boothsData);
      setNetworks(networksData);
    } catch (err) {
      console.error('Error loading reference data:', err);
    }
  };

  const loadBlocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getBlocks();
      setBlocks(data);
      
      // Load relationships for each block
      const relationships = {};
      for (const block of data) {
        relationships[block.id] = {
          commentators: block.commentators || [],
          booths: block.booths || [],
          networks: block.networks || []
        };
      }
      setBlockRelationships(relationships);
    } catch (err) {
      setError(err.message);
      console.error('Error loading blocks:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBlockRelationships = async (blockId) => {
    try {
      const [commentators, booths, networks] = await Promise.all([
        getBlockRelationships(blockId, 'commentators'),
        getBlockRelationships(blockId, 'booths'),
        getBlockRelationships(blockId, 'networks')
      ]);

      setBlockRelationships(prev => ({
        ...prev,
        [blockId]: {
          commentators: commentators.map(c => ({ id: c.commentator.id, name: c.commentator.name, role: c.role, linkId: c.id })),
          booths: booths.map(b => ({ id: b.booth.id, name: b.booth.name, linkId: b.id })),
          networks: networks.map(n => ({ id: n.network.id, name: n.network.name, linkId: n.id }))
        }
      }));
    } catch (err) {
      console.error('Error loading block relationships:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      const blockData = {
        ...formData,
        start_time: new Date(formData.start_time).toISOString(),
        end_time: new Date(formData.end_time).toISOString(),
        encoder_id: formData.encoder_id || null,
        producer_id: formData.producer_id || null,
        suite_id: formData.suite_id || null
      };

      if (editingBlock) {
        await updateBlock(editingBlock.id, blockData);
      } else {
        await createBlock(blockData);
      }

      resetForm();
      loadBlocks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (block) => {
    setEditingBlock(block);
    setFormData({
      name: block.name || '',
      block_id: block.block_id || '',
      obs_id: block.obs_id || '',
      start_time: block.start_time ? moment(block.start_time).format('YYYY-MM-DDTHH:mm') : '',
      end_time: block.end_time ? moment(block.end_time).format('YYYY-MM-DDTHH:mm') : '',
      encoder_id: block.encoder_id || '',
      producer_id: block.producer_id || '',
      suite_id: block.suite_id || ''
    });
    setShowForm(true);
    loadBlockRelationships(block.id);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this block?')) return;
    try {
      setError(null);
      await deleteBlock(id);
      loadBlocks();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      block_id: '',
      obs_id: '',
      start_time: '',
      end_time: '',
      encoder_id: '',
      producer_id: '',
      suite_id: ''
    });
    setEditingBlock(null);
    setShowForm(false);
  };

  const handleAddRelationship = async (blockId, relationshipType, relationshipId, role = null) => {
    try {
      await addBlockRelationship(blockId, relationshipType, relationshipId, role);
      loadBlockRelationships(blockId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveRelationship = async (blockId, relationshipType, linkId) => {
    try {
      await removeBlockRelationship(blockId, relationshipType, linkId);
      loadBlockRelationships(blockId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Blocks Management</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + New Block
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">
            {editingBlock ? 'Edit Block' : 'Create New Block'}
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Block ID</label>
              <input
                type="text"
                value={formData.block_id}
                onChange={(e) => setFormData({ ...formData, block_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">OBS ID</label>
              <input
                type="text"
                value={formData.obs_id}
                onChange={(e) => setFormData({ ...formData, obs_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Encoder</label>
              <select
                value={formData.encoder_id}
                onChange={(e) => setFormData({ ...formData, encoder_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                {encoders.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Producer</label>
              <select
                value={formData.producer_id}
                onChange={(e) => setFormData({ ...formData, producer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                {producers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Suite</label>
              <select
                value={formData.suite_id}
                onChange={(e) => setFormData({ ...formData, suite_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                {suites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Time *</label>
              <input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time *</label>
              <input
                type="datetime-local"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              {editingBlock ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500">Loading blocks...</div>
      ) : blocks.length === 0 ? (
        <div className="text-gray-500">No blocks yet. Create one above.</div>
      ) : (
        <div className="space-y-4">
          {blocks.map((block) => {
            const relationships = blockRelationships[block.id] || { commentators: [], booths: [], networks: [] };
            return (
              <div key={block.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{block.name}</h3>
                    {block.block_id && <p className="text-sm text-gray-600">ID: {block.block_id}</p>}
                    {block.obs_id && <p className="text-sm text-gray-600">OBS ID: {block.obs_id}</p>}
                    <p className="text-sm text-gray-600">
                      {moment(block.start_time).format('MMM D, YYYY HH:mm')} - {moment(block.end_time).format('HH:mm')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(block)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(block.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>Single:</strong>
                    <ul className="mt-1 space-y-1">
                      {block.encoder && <li>Encoder: {block.encoder.name}</li>}
                      {block.producer && <li>Producer: {block.producer.name}</li>}
                      {block.suite && <li>Suite: {block.suite.name}</li>}
                    </ul>
                  </div>
                  <div>
                    <strong>Commentators:</strong>
                    <ul className="mt-1 space-y-1">
                      {relationships.commentators.length === 0 ? (
                        <li className="text-gray-400">None</li>
                      ) : (
                        relationships.commentators.map(c => (
                          <li key={c.id}>
                            {c.name} {c.role && `(${c.role})`}
                            <button
                              onClick={() => handleRemoveRelationship(block.id, 'commentators', c.linkId)}
                              className="ml-2 text-red-600 hover:text-red-800"
                            >
                              ×
                            </button>
                          </li>
                        ))
                      )}
                      <li>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddRelationship(block.id, 'commentators', e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="mt-1 text-xs border border-gray-300 rounded"
                        >
                          <option value="">+ Add</option>
                          {commentators.filter(c => !relationships.commentators.find(r => r.id === c.id)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <strong>Booths/Networks:</strong>
                    <ul className="mt-1 space-y-1">
                      <li>
                        Booths: {relationships.booths.length === 0 ? 'None' : relationships.booths.map(b => b.name).join(', ')}
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddRelationship(block.id, 'booths', e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="ml-2 text-xs border border-gray-300 rounded"
                        >
                          <option value="">+ Add</option>
                          {booths.filter(b => !relationships.booths.find(r => r.id === b.id)).map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </li>
                      <li>
                        Networks: {relationships.networks.length === 0 ? 'None' : relationships.networks.map(n => n.name).join(', ')}
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddRelationship(block.id, 'networks', e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="ml-2 text-xs border border-gray-300 rounded"
                        >
                          <option value="">+ Add</option>
                          {networks.filter(n => !relationships.networks.find(r => r.id === n.id)).map(n => (
                            <option key={n.id} value={n.id}>{n.name}</option>
                          ))}
                        </select>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BlockManager;
