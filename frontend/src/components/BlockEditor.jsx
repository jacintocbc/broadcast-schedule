import { useState, useEffect } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { 
  updateBlock,
  deleteBlock,
  getResources,
  getBlockRelationships,
  addBlockRelationship,
  removeBlockRelationship
} from '../utils/api'

function BlockEditor({ block, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    name: '',
    block_id: '', // Keep for database, but don't display in UI
    obs_id: '',
    start_time: '',
    end_time: '',
    broadcast_start_time: '',
    broadcast_end_time: '',
    encoder_id: '',
    producer_id: '',
    suite_id: ''
  })

  // Reference data
  const [encoders, setEncoders] = useState([])
  const [producers, setProducers] = useState([])
  const [suites, setSuites] = useState([])
  const [commentators, setCommentators] = useState([])
  const [booths, setBooths] = useState([])
  const [networks, setNetworks] = useState([])

  // Block relationships
  const [relationships, setRelationships] = useState({
    commentators: [],
    booths: [],
    networks: []
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (block) {
      // Convert UTC times from database to EST for display in datetime-local inputs
      const formatTimeForInput = (utcTime) => {
        if (!utcTime) return ''
        // Parse as UTC and convert to EST
        return moment.utc(utcTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
      }
      
      setFormData({
        name: block.name || '',
        block_id: block.block_id || '', // Keep for database, but don't display
        obs_id: block.obs_id || '',
        start_time: formatTimeForInput(block.start_time),
        end_time: formatTimeForInput(block.end_time),
        broadcast_start_time: formatTimeForInput(block.broadcast_start_time),
        broadcast_end_time: formatTimeForInput(block.broadcast_end_time),
        encoder_id: block.encoder_id || '',
        producer_id: block.producer_id || '',
        suite_id: block.suite_id || ''
      })
      loadRelationships()
    }
    loadReferenceData()
  }, [block])

  const loadReferenceData = async () => {
    try {
      const [encodersData, producersData, suitesData, commentatorsData, boothsData, networksData] = await Promise.all([
        getResources('encoders'),
        getResources('producers'),
        getResources('suites'),
        getResources('commentators'),
        getResources('booths'),
        getResources('networks')
      ])
      setEncoders(encodersData)
      setProducers(producersData)
      setSuites(suitesData)
      setCommentators(commentatorsData)
      setBooths(boothsData)
      setNetworks(networksData)
    } catch (err) {
      console.error('Error loading reference data:', err)
    }
  }

  const loadRelationships = async () => {
    if (!block) return
    try {
      const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
        getBlockRelationships(block.id, 'commentators'),
        getBlockRelationships(block.id, 'booths'),
        getBlockRelationships(block.id, 'networks')
      ])

      setRelationships({
        commentators: commentatorsRes.map(c => ({ 
          id: c.commentator.id, 
          name: c.commentator.name, 
          role: c.role, 
          linkId: c.id 
        })),
        booths: boothsRes.map(b => ({ 
          id: b.booth.id, 
          name: b.booth.name, 
          linkId: b.id 
        })),
        networks: networksRes.map(n => ({ 
          id: n.network.id, 
          name: n.network.name, 
          linkId: n.id 
        }))
      })
    } catch (err) {
      console.error('Error loading relationships:', err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      
      // Convert datetime-local values (interpreted as EST) to UTC ISO strings
      const convertESTToUTC = (estDateTimeLocal) => {
        if (!estDateTimeLocal) return null
        // Parse the datetime-local value as EST and convert to UTC
        return moment.tz(estDateTimeLocal, 'America/New_York').utc().toISOString()
      }
      
      const blockData = {
        name: formData.name,
        obs_id: formData.obs_id || null,
        block_id: block.block_id || null, // Preserve block_id for relational use
        start_time: convertESTToUTC(formData.start_time),
        end_time: convertESTToUTC(formData.end_time),
        broadcast_start_time: convertESTToUTC(formData.broadcast_start_time),
        broadcast_end_time: convertESTToUTC(formData.broadcast_end_time),
        encoder_id: formData.encoder_id || null,
        producer_id: formData.producer_id || null,
        suite_id: formData.suite_id || null
      }

      await updateBlock(block.id, blockData)
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRelationship = async (relationshipType, relationshipId, role = null) => {
    try {
      await addBlockRelationship(block.id, relationshipType, relationshipId, role)
      loadRelationships()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemoveRelationship = async (relationshipType, linkId) => {
    try {
      await removeBlockRelationship(block.id, relationshipType, linkId)
      loadRelationships()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this block? This action cannot be undone.')) {
      return
    }
    try {
      setLoading(true)
      setError(null)
      await deleteBlock(block.id)
      onUpdate() // This will reload blocks and close the editor
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete block')
    } finally {
      setLoading(false)
    }
  }

  if (!block) return null

  return (
    <div className="h-full bg-white border-l border-gray-300 shadow-lg flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Edit Block</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          title="Close"
        >
          ×
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Basic Information */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Basic Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
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
            </div>
          </section>

          {/* Times */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Times</h3>
            <div className="space-y-3">
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
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast Start Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_start_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_start_time: e.target.value })}
                  min={formData.start_time ? (() => {
                    // Set min to same date as start time, but allow any time
                    const startDate = formData.start_time.split('T')[0]
                    return `${startDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    // When calendar opens, if empty, suggest 10 minutes before start time (same date)
                    if (!formData.broadcast_start_time && formData.start_time) {
                      const startMoment = moment.tz(formData.start_time, 'America/New_York')
                      const suggested = startMoment.clone().subtract(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_start_time: suggested }))
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast End Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_end_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_end_time: e.target.value })}
                  min={formData.end_time ? (() => {
                    // Set min to same date as end time, but allow any time
                    const endDate = formData.end_time.split('T')[0]
                    return `${endDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    // When calendar opens, if empty, suggest 10 minutes after end time (same date)
                    if (!formData.broadcast_end_time && formData.end_time) {
                      const endMoment = moment.tz(formData.end_time, 'America/New_York')
                      const suggested = endMoment.clone().add(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_end_time: suggested }))
                    }
                  }}
                />
              </div>
            </div>
          </section>

          {/* Single Relationships */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Resources</h3>
            <div className="space-y-3">
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
            </div>
          </section>

          {/* Multiple Relationships */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Commentators</h3>
            <div className="space-y-2">
              {relationships.commentators.length === 0 ? (
                <p className="text-sm text-gray-500">No commentators</p>
              ) : (
                relationships.commentators.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{c.name} {c.role && `(${c.role})`}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelationship('commentators', c.linkId)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddRelationship('commentators', e.target.value)
                    e.target.value = ''
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">+ Add Commentator</option>
                {commentators.filter(c => !relationships.commentators.find(r => r.id === c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Booths</h3>
            <div className="space-y-2">
              {relationships.booths.length === 0 ? (
                <p className="text-sm text-gray-500">No booths</p>
              ) : (
                relationships.booths.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{b.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelationship('booths', b.linkId)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddRelationship('booths', e.target.value)
                    e.target.value = ''
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">+ Add Booth</option>
                {booths.filter(b => !relationships.booths.find(r => r.id === b.id)).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Networks</h3>
            <div className="space-y-2">
              {relationships.networks.length === 0 ? (
                <p className="text-sm text-gray-500">No networks</p>
              ) : (
                relationships.networks.map(n => (
                  <div key={n.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{n.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelationship('networks', n.linkId)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddRelationship('networks', e.target.value)
                    e.target.value = ''
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">+ Add Network</option>
                {networks.filter(n => !relationships.networks.find(r => r.id === n.id)).map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
          </section>

          <div className="flex flex-col gap-2 pt-4 border-t">
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Delete Block'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default BlockEditor
