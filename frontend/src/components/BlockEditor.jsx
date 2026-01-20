import { useState, useEffect, useMemo } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { 
  updateBlock,
  deleteBlock,
  getResources,
  getBlocks,
  getBlockRelationships,
  addBlockRelationship,
  removeBlockRelationship
} from '../utils/api'
import { realtimeManager } from '../utils/realtimeManager'
import { BLOCK_TYPES } from '../utils/blockTypes'

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
    suite_id: '',
    type: '',
    canadian_content: false
  })

  // Reference data
  const [encoders, setEncoders] = useState([])
  const [producers, setProducers] = useState([])
  const [suites, setSuites] = useState([])
  const [commentators, setCommentators] = useState([])
  const [booths, setBooths] = useState([])
  const [networks, setNetworks] = useState([])
  const [allBlocks, setAllBlocks] = useState([]) // For checking booth availability

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
    cbcWeb: 'CBC Gem',
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
        suite_id: block.suite_id || '',
        type: block.type || '',
        canadian_content: block.canadian_content || false
      })
      loadRelationships()
    }
    loadReferenceData()
  }, [block])

  const loadReferenceData = async () => {
    try {
      const [encodersData, producersData, suitesData, commentatorsData, boothsData, networksData, blocksData] = await Promise.all([
        getResources('encoders'),
        getResources('producers'),
        getResources('suites'),
        getResources('commentators'),
        getResources('booths'),
        getResources('networks'),
        getBlocks() // Load all blocks to check booth availability
      ])
      setEncoders(encodersData)
      setProducers(producersData)
      setSuites(suitesData)
      setCommentators(commentatorsData)
      setBooths(boothsData)
      setNetworks(networksData)
      setAllBlocks(blocksData || [])
    } catch (err) {
      console.error('Error loading reference data:', err)
    }
  }

  // Real-time subscriptions for reference data
  useEffect(() => {
    const unsubscribers = [
      realtimeManager.subscribe('encoders', () => {
        getResources('encoders').then(setEncoders).catch(console.error)
      }),
      realtimeManager.subscribe('producers', () => {
        getResources('producers').then(setProducers).catch(console.error)
      }),
      realtimeManager.subscribe('suites', () => {
        getResources('suites').then(setSuites).catch(console.error)
      }),
      realtimeManager.subscribe('commentators', () => {
        getResources('commentators').then(setCommentators).catch(console.error)
      }),
      realtimeManager.subscribe('booths', () => {
        getResources('booths').then(setBooths).catch(console.error)
      }),
      realtimeManager.subscribe('networks', () => {
        getResources('networks').then(setNetworks).catch(console.error)
      }),
      realtimeManager.subscribe('blocks', () => {
        getBlocks().then(data => setAllBlocks(data || [])).catch(console.error)
      }),
      realtimeManager.subscribe('block_booths', () => {
        getBlocks().then(data => setAllBlocks(data || [])).catch(console.error)
      }),
    ]
    
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [])

  // Real-time subscriptions for block relationships (when block is selected)
  useEffect(() => {
    if (!block) return
    
    const handleRelationshipChange = (payload) => {
      if (payload.new?.block_id === block.id || payload.old?.block_id === block.id) {
        loadRelationships()
      }
    }
    
    // Subscribe to relationship changes for this specific block
    const unsubscribers = [
      realtimeManager.subscribe('block_booths', handleRelationshipChange),
      realtimeManager.subscribe('block_commentators', handleRelationshipChange),
      realtimeManager.subscribe('block_networks', handleRelationshipChange),
    ]
    
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [block])

  // Check if a booth is available during the block's time range
  // When editing, exclude the current block from availability checks
  // VIS can always be used (can be assigned to multiple blocks at the same time)
  const isBoothAvailable = useMemo(() => {
    return (boothId) => {
      if (!formData.start_time || !formData.end_time || !boothId) return true
      
      // Find the booth to check its name
      const booth = booths.find(b => b.id === boothId)
      
      // VIS can always be used (no availability check needed)
      if (booth && booth.name === 'VIS') {
        return true
      }
      
      const blockStart = moment.tz(formData.start_time, 'America/New_York').utc()
      const blockEnd = moment.tz(formData.end_time, 'America/New_York').utc()
      
      // Check if any existing block (other than the current one) uses this booth during an overlapping time period
      return !allBlocks.some(existingBlock => {
        // Skip the current block being edited
        if (block && existingBlock.id === block.id) return false
        
        // Skip if block has no time range
        if (!existingBlock.start_time || !existingBlock.end_time) return false
        
        // Check if this block uses the booth
        const hasBooth = existingBlock.booths && existingBlock.booths.some(b => b.id === boothId)
        if (!hasBooth) return false
        
        // Check for time overlap
        const existingStart = moment.utc(existingBlock.start_time)
        const existingEnd = moment.utc(existingBlock.end_time)
        
        // Two time ranges overlap if: start1 < end2 && start2 < end1
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, allBlocks, block, booths])

  const loadRelationships = async () => {
    if (!block) return
    try {
      // Always fetch booth relationships to get the correct structure with link IDs
      const boothsData = await getBlockRelationships(block.id, 'booths')
      const boothsRes = boothsData || []
      
      const [commentatorsRes, networksRes] = await Promise.all([
        getBlockRelationships(block.id, 'commentators'),
        getBlockRelationships(block.id, 'networks')
      ])
      

      setRelationships({
        commentators: commentatorsRes.map(c => ({ 
          id: c.commentator.id, 
          name: c.commentator.name, 
          role: c.role, 
          linkId: c.id 
        })),
        booths: boothsRes.map(b => {
          // Handle both structures: from block.booths and from getBlockRelationships
          const boothId = b.booth?.id || b.id
          const boothName = b.booth?.name || b.name
          return {
            id: boothId,
            name: boothName,
            linkId: b.id || b.linkId,
            network_id: b.network_id || (b.network ? b.network.id : null),
            network: b.network ? {
              id: b.network.id,
              name: b.network.name
            } : null
          }
        }),
        networks: networksRes.map(n => ({ 
          id: n.network.id, 
          name: n.network.name, 
          linkId: n.id 
        }))
      })
      
      // Initialize booth selections from relationships
      // Match networks to their corresponding booths
      // Since the same booth can be used for multiple networks, we need to match each network to a booth
      // We match by checking the network_id in each booth relationship
      const boothMap = {}
      
      // Flexible network name matching function
      const matchNetworkName = (networkName) => {
        if (!networkName) return null
        const nameLower = networkName.toLowerCase().trim()
        // CBC TV
        if (nameLower === 'cbc tv' || nameLower.includes('cbc tv')) {
          return 'cbcTv'
        }
        // CBC Gem / CBC Web / Gem / Web
        // Note: Database has 'Gem' but we treat it as 'CBC Gem'
        if (nameLower === 'cbc gem' || nameLower === 'cbc web' || 
            nameLower === 'gem' || nameLower === 'web' ||
            nameLower.includes('cbc gem') || nameLower.includes('cbc web')) {
          return 'cbcWeb'
        }
        // R-C TV/Web (handle various formats)
        if (nameLower.includes('r-c') || nameLower.includes('rc tv') || 
            nameLower.includes('radio-canada')) {
          return 'rcTvWeb'
        }
        return null
      }
      
      
      // First, create a map of network IDs to network names from networksRes
      const networkIdToName = {}
      networksRes.forEach(networkRel => {
        if (networkRel.network) {
          networkIdToName[networkRel.network.id] = networkRel.network.name
        }
      })
      
      // Match booths to networks by network_id
      // Each booth relationship has a network_id that links it to a specific network
      boothsRes.forEach(boothRel => {
        // getBlockRelationships returns: { id: linkId, booth: { id, name }, network_id, network: {...} }
        // But we need to handle the case where booth might be nested or flat
        const boothId = boothRel.booth?.id || boothRel.booth_id || boothRel.id
        const boothNetworkId = boothRel.network_id || (boothRel.network ? boothRel.network.id : null)
        
        if (!boothId) {
          return
        }
        
        if (boothNetworkId) {
          // Try to get network name from networkIdToName map first
          let networkName = networkIdToName[boothNetworkId]
          
          // Fallback to boothRel.network.name if not in map
          if (!networkName && boothRel.network && boothRel.network.name) {
            networkName = boothRel.network.name
          }
          
          if (networkName) {
            const labelKey = matchNetworkName(networkName)
            if (labelKey) {
              boothMap[labelKey] = boothId
            }
          }
        } else if (boothRel.network && boothRel.network.name) {
          // Fallback: use network name directly if network_id is missing
          const labelKey = matchNetworkName(boothRel.network.name)
          if (labelKey) {
            boothMap[labelKey] = boothId
          }
        }
      })
      
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
        suite_id: formData.suite_id || null,
        type: formData.type || null,
        canadian_content: formData.canadian_content || false
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
      await loadRelationships()
    } catch (err) {
      console.error(`Error adding ${relationshipType} relationship:`, err)
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

          {/* Type and Canadian Content */}
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                {BLOCK_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="canadian_content"
                checked={formData.canadian_content}
                onChange={(e) => setFormData({ ...formData, canadian_content: e.target.checked })}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="canadian_content" className="text-sm font-medium text-red-600 cursor-pointer">
                🍁
              </label>
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
                      
                      // Remove old booth relationship for this specific network
                      if (oldValue && oldValue !== newValue) {
                        const network = networks.find(n => n.name === networkLabels.cbcTv)
                        if (network) {
                          // Find and remove the booth relationship for this specific network
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const boothToRemove = currentBooths.find(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return b.booth.id === oldValue && boothNetworkId === network.id
                          })
                          if (boothToRemove) {
                            await handleRemoveRelationship('booths', boothToRemove.id)
                          }
                          // Check if this network is still used by other booths before removing
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id && b.booth.id !== oldValue
                          })
                          // Only remove network relationship if no other booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.name === networkLabels.cbcTv)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                      }
                      
                      // Add new booth with its network
                      if (newValue) {
                        const network = networks.find(n => n.name === networkLabels.cbcTv)
                        if (network) {
                          try {
                            // First, ensure the network relationship exists (idempotent - will handle duplicates)
                            try {
                              await addBlockRelationship(block.id, 'networks', network.id)
                            } catch (networkErr) {
                              // Network might already exist (409), that's okay - continue
                              if (!networkErr.message || !networkErr.message.includes('409')) {
                                // Non-409 error, but continue anyway
                              }
                            }
                            // Add booth relationship with network_id to link booth to this specific network
                            // This allows the same booth to be used for different networks
                            await addBlockRelationship(block.id, 'booths', newValue, null, network.id)
                            // Reload relationships to update the UI
                            await loadRelationships()
                          } catch (err) {
                            setError(err.message || 'Failed to add booth relationship')
                            // Reload to sync state
                            await loadRelationships()
                          }
                        }
                      } else {
                        // If clearing the selection, check if we should remove the network
                        const network = networks.find(n => n.name === networkLabels.cbcTv)
                        if (network) {
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id
                          })
                          // Only remove network relationship if no booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.id === network.id)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                        // Reload relationships to update the UI
                        await loadRelationships()
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => {
                      const available = isBoothAvailable(b.id)
                      return (
                        <option 
                          key={b.id} 
                          value={b.id}
                          disabled={!available}
                          style={{ color: available ? 'inherit' : '#9ca3af' }}
                        >
                          {b.name}{!available ? ' (Unavailable)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">CBC Gem - Booth</label>
                  <select
                    value={boothSelections.cbcWeb}
                    onChange={async (e) => {
                      const newValue = e.target.value
                      const oldValue = boothSelections.cbcWeb
                      setBoothSelections({ ...boothSelections, cbcWeb: newValue })
                      
                      if (oldValue && oldValue !== newValue) {
                        const network = networks.find(n => n.name === networkLabels.cbcWeb)
                        if (network) {
                          // Find and remove the booth relationship for this specific network
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const boothToRemove = currentBooths.find(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return b.booth.id === oldValue && boothNetworkId === network.id
                          })
                          if (boothToRemove) {
                            await handleRemoveRelationship('booths', boothToRemove.id)
                          }
                          // Check if this network is still used by other booths before removing
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id && b.booth.id !== oldValue
                          })
                          // Only remove network relationship if no other booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.name === networkLabels.cbcWeb)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                      }
                      
                      if (newValue) {
                        // Try multiple possible names for CBC Gem - case insensitive and flexible matching
                        // Note: Database has 'Gem' but we want to match it as 'CBC Gem'
                        const network = networks.find(n => {
                          if (!n.name) return false
                          const nameLower = n.name.toLowerCase().trim()
                          return nameLower === 'cbc gem' || 
                                 nameLower === 'cbc web' ||
                                 nameLower === 'gem' ||  // Database has just 'Gem'
                                 nameLower === 'web' ||  // In case it's 'Web'
                                 nameLower.includes('cbc gem') ||
                                 nameLower.includes('cbc web') ||
                                 n.name === networkLabels.cbcWeb ||
                                 n.name === 'CBC Gem' || 
                                 n.name === 'CBC GEM' ||
                                 n.name === 'CBC Web' ||
                                 n.name === 'CBC WEB' ||
                                 n.name === 'Gem' ||  // Exact match for database value
                                 n.name === 'Web'     // In case it's 'Web'
                        })
                        if (network) {
                          try {
                            // First, ensure the network relationship exists (idempotent - will handle duplicates)
                            try {
                              await addBlockRelationship(block.id, 'networks', network.id)
                            } catch (networkErr) {
                              // Network might already exist (409), that's okay - continue
                              if (!networkErr.message || !networkErr.message.includes('409')) {
                                // Non-409 error, but continue anyway
                              }
                            }
                            // Add booth relationship with network_id to link booth to this specific network
                            // This allows the same booth to be used for different networks
                            await addBlockRelationship(block.id, 'booths', newValue, null, network.id)
                            // Reload relationships to update the UI
                            await loadRelationships()
                          } catch (err) {
                            setError(err.message || 'Failed to add booth relationship')
                            // Reload to sync state
                            await loadRelationships()
                          }
                        }
                      } else {
                        // If clearing the selection, check if we should remove the network
                        const network = networks.find(n => n.name === networkLabels.cbcWeb)
                        if (network) {
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id
                          })
                          // Only remove network relationship if no booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.id === network.id)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                        // Reload relationships to update the UI
                        await loadRelationships()
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => {
                      const available = isBoothAvailable(b.id)
                      return (
                        <option 
                          key={b.id} 
                          value={b.id}
                          disabled={!available}
                          style={{ color: available ? 'inherit' : '#9ca3af' }}
                        >
                          {b.name}{!available ? ' (Unavailable)' : ''}
                        </option>
                      )
                    })}
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
                        const network = networks.find(n => n.name === networkLabels.rcTvWeb)
                        if (network) {
                          // Find and remove the booth relationship for this specific network
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const boothToRemove = currentBooths.find(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return b.booth.id === oldValue && boothNetworkId === network.id
                          })
                          if (boothToRemove) {
                            await handleRemoveRelationship('booths', boothToRemove.id)
                          }
                          // Check if this network is still used by other booths before removing
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id && b.booth.id !== oldValue
                          })
                          // Only remove network relationship if no other booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.name === networkLabels.rcTvWeb)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                      }
                      
                      if (newValue) {
                        // Try multiple possible names for R-C TV/Web - case insensitive and flexible matching
                        const network = networks.find(n => {
                          const nameLower = n.name.toLowerCase().trim()
                          return nameLower.includes('r-c') || 
                                 nameLower.includes('r-c tv') ||
                                 nameLower.includes('rc tv') ||
                                 nameLower.includes('radio-canada') ||
                                 n.name === networkLabels.rcTvWeb ||
                                 n.name === 'R-C TV/WEB' || 
                                 n.name === 'R-C TV/Web' ||
                                 n.name === 'R-C TV/WEB'
                        })
                        if (network) {
                          try {
                            // First, ensure the network relationship exists (idempotent - will handle duplicates)
                            try {
                              await addBlockRelationship(block.id, 'networks', network.id)
                            } catch (networkErr) {
                              // Network might already exist (409), that's okay - continue
                              if (!networkErr.message || !networkErr.message.includes('409')) {
                                // Non-409 error, but continue anyway
                              }
                            }
                            // Add booth relationship with network_id to link booth to this specific network
                            // This allows the same booth to be used for different networks
                            await addBlockRelationship(block.id, 'booths', newValue, null, network.id)
                            // Reload relationships to update the UI
                            await loadRelationships()
                          } catch (err) {
                            setError(err.message || 'Failed to add booth relationship')
                            // Reload to sync state
                            await loadRelationships()
                          }
                        }
                      } else {
                        // If clearing the selection, check if we should remove the network
                        const network = networks.find(n => n.name === networkLabels.rcTvWeb)
                        if (network) {
                          const currentBooths = await getBlockRelationships(block.id, 'booths')
                          const remainingBoothsForNetwork = currentBooths.filter(b => {
                            const boothNetworkId = b.network_id || (b.network ? b.network.id : null)
                            return boothNetworkId === network.id
                          })
                          // Only remove network relationship if no booths use it
                          if (remainingBoothsForNetwork.length === 0) {
                            const existingNetwork = relationships.networks.find(n => n.id === network.id)
                            if (existingNetwork) {
                              await handleRemoveRelationship('networks', existingNetwork.linkId)
                            }
                          }
                        }
                        // Reload relationships to update the UI
                        await loadRelationships()
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
