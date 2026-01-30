import { useState, useEffect } from 'react';
import { getResources, createResource, updateResource, deleteResource } from '../utils/api';
import { realtimeManager } from '../utils/realtimeManager';

function ResourceManager({ resourceType, displayName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadItems();
    
    // Subscribe to real-time changes for this resource type
    const unsubscribe = realtimeManager.subscribe(resourceType, () => {
      loadItems()
    })
    
    return () => {
      unsubscribe()
    }
  }, [resourceType]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getResources(resourceType);
      setItems(data);
    } catch (err) {
      setError(err.message);
      console.error(`Error loading ${resourceType}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setError(null);
      await createResource(resourceType, newName.trim());
      setNewName('');
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name);
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;

    try {
      setError(null);
      await updateResource(resourceType, id, editName.trim());
      setEditingId(null);
      setEditName('');
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(`Are you sure you want to delete this ${displayName.toLowerCase()}?`)) return;

    try {
      setError(null);
      await deleteResource(resourceType, id);
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">{displayName} Management</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add new ${displayName.toLowerCase()}...`}
          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Add
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400">No {displayName.toLowerCase()} yet. Add one above.</div>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 p-3 bg-gray-700 border border-gray-600 rounded-md">
              {editingId === item.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdate(item.id)}
                    type="button"
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    type="button"
                    className="px-3 py-1 bg-gray-600 text-gray-200 rounded hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-white">{item.name}</span>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(item)}
                      type="button"
                      className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      type="button"
                      className="px-3 py-1 bg-gray-600 text-red-200 rounded hover:bg-gray-500 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ResourceManager;
