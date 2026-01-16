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
  
  // State for booth selections (networks are automatically added based on booth selection)
  const [boothSelections, setBoothSelections] = useState({
    cbcTv: '',
    cbcWeb: '',
    rcTvWeb: ''
  })
  
  // State for commentator selections (three dropdowns: PxP, Color, Spare)
  const [commentatorSelections, setCommentatorSelections] = useState({
    pxp: '',
    color: '',
    spare: ''
  })
  
  // Network labels that correspond to booth selections
  const networkLabels = {
    cbcTv: 'CBC TV',
    cbcWeb: 'CBC WEB',
    rcTvWeb: 'R-C TV/WEB'
  }

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
      
      // Initialize booth selections from relationships
      // Match booths to their corresponding network labels
      const boothMap = {}
      const networkLabels = {
        'CBC TV': 'cbcTv',
        'CBC WEB': 'cbcWeb',
        'R-C TV/WEB': 'rcTvWeb'
      }
      
      // Match each booth to its network label
      boothsRes.forEach(boothRel => {
        const matchingNetwork = networksRes.find(n => {
          const networkLabel = networkLabels[n.network.name]
          return networkLabel
        })
        if (matchingNetwork) {
          const labelKey = networkLabels[matchingNetwork.network.name]
          if (labelKey) {
            boothMap[labelKey] = boothRel.booth.id
          }
        }
      })
      
      // Also check if we have unmatched booths (fallback to first 3)
      if (!boothMap.cbcTv && boothsRes[0]) boothMap.cbcTv = boothsRes[0].booth.id
      if (!boothMap.cbcWeb && boothsRes[1]) boothMap.cbcWeb = boothsRes[1].booth.id
      if (!boothMap.rcTvWeb && boothsRes[2]) boothMap.rcTvWeb = boothsRes[2].booth.id
      
      setBoothSelections({
        cbcTv: boothMap.cbcTv || '',
        cbcWeb: boothMap.cbcWeb || '',
        rcTvWeb: boothMap.rcTvWeb || ''
      })
      
      // Initialize commentator selections from relationships
      const commentatorMap = {
        pxp: '',
        color: '',
        spare: ''
      }
      
      commentatorsRes.forEach(c => {
        if (c.role === 'PxP') {
          commentatorMap.pxp = c.commentator.id
        } else if (c.role === 'Color') {
          commentatorMap.color = c.commentator.id
        } else if (c.role === 'Spare') {
          commentatorMap.spare = c.commentator.id
        }
      })
      
      setCommentatorSelections(commentatorMap)
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
          {/* Event Name */}
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

          {/* Times */}
          <div>
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
          </div>

          {/* Resources */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Resources</h3>
            <div className="space-y-3">
              {/* Encoder */}
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
              
              {/* Booths - networks are automatically added based on booth selection */}
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">CBC TV - Booth</label>
                  <select
                    value={boothSelections.cbcTv}
                    onChange={async (e) => {
                      const newValue = e.target.value
                      const oldValue = boothSelections.cbcTv
                      setBoothSelections({ ...boothSelections, cbcTv: newValue })
                      
                      // Remove old booth and its network
                      if (oldValue && oldValue !== newValue) {
                        const existingBooth = relationships.booths.find(b => b.id === oldValue)
                        if (existingBooth) {
                          await handleRemoveRelationship('booths', existingBooth.linkId)
                        }
                        // Find and remove the corresponding network
                        const existingNetwork = relationships.networks.find(n => n.name === networkLabels.cbcTv)
                        if (existingNetwork) {
                          await handleRemoveRelationship('networks', existingNetwork.linkId)
                        }
                      }
                      
                      // Add new booth and its network
                      if (newValue) {
                        await handleAddRelationship('booths', newValue)
                        // Find network by label
                        const network = networks.find(n => n.name === networkLabels.cbcTv)
                        if (network) {
                          await handleAddRelationship('networks', network.id)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">CBC WEB - Booth</label>
                  <select
                    value={boothSelections.cbcWeb}
                    onChange={async (e) => {
                      const newValue = e.target.value
                      const oldValue = boothSelections.cbcWeb
                      setBoothSelections({ ...boothSelections, cbcWeb: newValue })
                      
                      if (oldValue && oldValue !== newValue) {
                        const existingBooth = relationships.booths.find(b => b.id === oldValue)
                        if (existingBooth) {
                          await handleRemoveRelationship('booths', existingBooth.linkId)
                        }
                        const existingNetwork = relationships.networks.find(n => n.name === networkLabels.cbcWeb)
                        if (existingNetwork) {
                          await handleRemoveRelationship('networks', existingNetwork.linkId)
                        }
                      }
                      
                      if (newValue) {
                        await handleAddRelationship('booths', newValue)
                        const network = networks.find(n => n.name === networkLabels.cbcWeb)
                        if (network) {
                          await handleAddRelationship('networks', network.id)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">R-C TV/WEB - Booth</label>
                  <select
                    value={boothSelections.rcTvWeb}
                    onChange={async (e) => {
                      const newValue = e.target.value
                      const oldValue = boothSelections.rcTvWeb
                      setBoothSelections({ ...boothSelections, rcTvWeb: newValue })
                      
                      if (oldValue && oldValue !== newValue) {
                        const existingBooth = relationships.booths.find(b => b.id === oldValue)
                        if (existingBooth) {
                          await handleRemoveRelationship('booths', existingBooth.linkId)
                        }
                        const existingNetwork = relationships.networks.find(n => n.name === networkLabels.rcTvWeb)
                        if (existingNetwork) {
                          await handleRemoveRelationship('networks', existingNetwork.linkId)
                        }
                      }
                      
                      if (newValue) {
                        await handleAddRelationship('booths', newValue)
                        const network = networks.find(n => n.name === networkLabels.rcTvWeb)
                        if (network) {
                          await handleAddRelationship('networks', network.id)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Commentators */}
              <div>
                <label className="block text-sm font-medium mb-1">Commentators</label>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">PxP</label>
                    <select
                      value={commentatorSelections.pxp}
                      onChange={async (e) => {
                        const newValue = e.target.value
                        const oldValue = commentatorSelections.pxp
                        setCommentatorSelections({ ...commentatorSelections, pxp: newValue })
                        
                        // Remove old commentator relationship if it exists
                        if (oldValue) {
                          const existing = relationships.commentators.find(c => c.id === oldValue && c.role === 'PxP')
                          if (existing) {
                            await handleRemoveRelationship('commentators', existing.linkId)
                          }
                        }
                        
                        // Add new commentator relationship with role
                        if (newValue) {
                          await handleAddRelationship('commentators', newValue, 'PxP')
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Color</label>
                    <select
                      value={commentatorSelections.color}
                      onChange={async (e) => {
                        const newValue = e.target.value
                        const oldValue = commentatorSelections.color
                        setCommentatorSelections({ ...commentatorSelections, color: newValue })
                        
                        if (oldValue) {
                          const existing = relationships.commentators.find(c => c.id === oldValue && c.role === 'Color')
                          if (existing) {
                            await handleRemoveRelationship('commentators', existing.linkId)
                          }
                        }
                        
                        if (newValue) {
                          await handleAddRelationship('commentators', newValue, 'Color')
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Spare</label>
                    <select
                      value={commentatorSelections.spare}
                      onChange={async (e) => {
                        const newValue = e.target.value
                        const oldValue = commentatorSelections.spare
                        setCommentatorSelections({ ...commentatorSelections, spare: newValue })
                        
                        if (oldValue) {
                          const existing = relationships.commentators.find(c => c.id === oldValue && c.role === 'Spare')
                          if (existing) {
                            await handleRemoveRelationship('commentators', existing.linkId)
                          }
                        }
                        
                        if (newValue) {
                          await handleAddRelationship('commentators', newValue, 'Spare')
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Producer */}
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
              
              {/* Suite */}
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

          <div className="flex gap-2 pt-4 border-t">
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
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              title="Delete Block"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default BlockEditor
