import { useState, useEffect, useMemo } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { createBlock, addBlockRelationship, getBlocks, getResources } from '../utils/api'
import { realtimeManager } from '../utils/realtimeManager'
import { BLOCK_TYPES, inferBlockType } from '../utils/blockTypes'

function AddToCBCForm({ event, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [encoders, setEncoders] = useState([])
  const [producers, setProducers] = useState([])
  const [suites, setSuites] = useState([])
  const [commentators, setCommentators] = useState([])
  const [booths, setBooths] = useState([])
  const [networks, setNetworks] = useState([])
  const [allBlocks, setAllBlocks] = useState([]) // For checking booth availability
  
  // Form state for commentators and booths
  const [commentatorSelections, setCommentatorSelections] = useState({
    pxp: '',
    color: '',
    spare: ''
  })
  const [boothSelections, setBoothSelections] = useState({
    cbcTv: '',
    cbcWeb: '',
    rcTvWeb: ''
  })
  
  // Collapsible sections state (collapsed by default)
  const [expandedSections, setExpandedSections] = useState({
    commentators: false,
    producer: false,
    suite: false
  })
  
  // Network labels that correspond to booth selections (these are just labels, not actual network records)
  const networkLabels = {
    cbcTv: 'CBC TV',
    cbcWeb: 'CBC Gem',
    rcTvWeb: 'R-C TV/WEB'
  }
  
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  useEffect(() => {
    if (event) {
      // Convert UTC times from event to Milan time for display in datetime-local inputs
      const formatTimeForInput = (utcTime) => {
        if (!utcTime) return ''
        // Parse as UTC and convert to Milan time
        return moment.utc(utcTime).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
      }
      
      // Infer type from event name
      const inferredType = inferBlockType(event.title || '')
      
      // Check if this is a 24-hour beauty camera event (starts with "BC" and has 0 duration)
      const isBeautyCamera = (event.title || '').trim().toUpperCase().startsWith('BC')
      const isZeroDuration = event.start_time && event.end_time && 
        moment.utc(event.start_time).isSame(moment.utc(event.end_time))
      
      let startTime = formatTimeForInput(event.start_time)
      let endTime = formatTimeForInput(event.end_time)
      
      // If it's a 24-hour beauty camera, set default times: same day at 1:30 AM Milan to next day 1:30 AM Milan
      if (isBeautyCamera && isZeroDuration) {
        // Get the date from the event's start_time (or use today)
        const eventDate = event.start_time 
          ? moment.utc(event.start_time).tz('Europe/Rome').format('YYYY-MM-DD')
          : moment.tz('Europe/Rome').format('YYYY-MM-DD')
        
        // Start: same day at 1:30 AM Milan time (form inputs are now in Milan time)
        startTime = `${eventDate}T01:30`
        
        // End: next day at 1:30 AM Milan time
        const nextDay = moment.tz(`${eventDate} 01:30`, 'Europe/Rome').add(1, 'day').format('YYYY-MM-DD')
        endTime = `${nextDay}T01:30`
      }
      
      // Pre-fill form with event data
      setFormData({
        name: event.title || '',
        obs_id: event.id || '',
        start_time: startTime,
        end_time: endTime,
        broadcast_start_time: '',
        broadcast_end_time: '',
        encoder_id: '',
        producer_id: '',
        suite_id: '',
        type: inferredType,
        canadian_content: false
      })
    }
    loadReferenceData()
  }, [event])

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

  // Check which booths are unavailable (already assigned to blocks that overlap with this block's time)
  const unavailableBooths = useMemo(() => {
    if (!formData.start_time || !formData.end_time) {
      return new Set()
    }

    // Convert form times (Milan) to UTC for comparison
    const blockStart = moment.tz(formData.start_time, 'Europe/Rome').utc()
    const blockEnd = moment.tz(formData.end_time, 'Europe/Rome').utc()

    const unavailable = new Set()

    // Check all existing blocks for time overlaps
    allBlocks.forEach(block => {
      if (!block.start_time || !block.end_time) return

      const existingStart = moment.utc(block.start_time)
      const existingEnd = moment.utc(block.end_time)

      // Check if time ranges overlap
      // Two time ranges overlap if: start1 < end2 && start2 < end1
      if (blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)) {
        // This block overlaps with our time range
        // Mark all booths assigned to this block as unavailable
        if (block.booths && block.booths.length > 0) {
          block.booths.forEach(booth => {
            unavailable.add(booth.id)
          })
        }
      }
    })

    return unavailable
  }, [formData.start_time, formData.end_time, allBlocks])
  
  // Sort booths: VT booths first, then VIS/VOBS, then VM booths at the end
  const sortedBooths = useMemo(() => {
    const vtBooths = []
    const visVobsBooths = []
    const vmBooths = []
    const otherBooths = []
    
    booths.forEach(booth => {
      const name = booth.name || ''
      if (name.startsWith('VT ')) {
        vtBooths.push(booth)
      } else if (name === 'VIS' || name === 'VOBS') {
        visVobsBooths.push(booth)
      } else if (name.startsWith('VM ')) {
        vmBooths.push(booth)
      } else {
        otherBooths.push(booth)
      }
    })
    
    // Sort VT booths numerically
    vtBooths.sort((a, b) => {
      const aNum = parseInt(a.name.match(/\d+/)?.[0] || '999', 10)
      const bNum = parseInt(b.name.match(/\d+/)?.[0] || '999', 10)
      return aNum - bNum
    })
    
    // Sort VIS/VOBS: VIS first, then VOBS
    visVobsBooths.sort((a, b) => {
      if (a.name === 'VIS') return -1
      if (b.name === 'VIS') return 1
      return 0
    })
    
    // Sort VM booths numerically
    vmBooths.sort((a, b) => {
      const aNum = parseInt(a.name.match(/\d+/)?.[0] || '999', 10)
      const bNum = parseInt(b.name.match(/\d+/)?.[0] || '999', 10)
      return aNum - bNum
    })
    
    // Combine: VIS/VOBS, VT, VM, others
    return [...visVobsBooths, ...vtBooths, ...vmBooths, ...otherBooths]
  }, [booths])

  // Check if a booth is available during the block's time range
  // VIS and VOBS can always be used (can be assigned to multiple blocks at the same time)
  const isBoothAvailable = useMemo(() => {
    return (boothId) => {
      if (!formData.start_time || !formData.end_time || !boothId) return true
      
      // Find the booth to check its name
      const booth = booths.find(b => b.id === boothId)
      
      // VIS and VOBS can always be used (no availability check needed)
      if (booth && (booth.name === 'VIS' || booth.name === 'VOBS')) {
        return true
      }
      
      const blockStart = moment.tz(formData.start_time, 'Europe/Rome').utc()
      const blockEnd = moment.tz(formData.end_time, 'Europe/Rome').utc()
      
      // Check if any existing block uses this booth during an overlapping time period
      return !allBlocks.some(block => {
        // Skip if block has no time range
        if (!block.start_time || !block.end_time) return false
        
        // Check if this block uses the booth
        const hasBooth = block.booths && block.booths.some(b => b.id === boothId)
        if (!hasBooth) return false
        
        // Check for time overlap
        const existingStart = moment.utc(block.start_time)
        const existingEnd = moment.utc(block.end_time)
        
        // Two time ranges overlap if: start1 < end2 && start2 < end1
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, allBlocks, booths])

  // Check if a commentator is available during the block's time range
  const isCommentatorAvailable = useMemo(() => {
    return (commentatorId) => {
      if (!formData.start_time || !formData.end_time || !commentatorId) return true
      
      const blockStart = moment.tz(formData.start_time, 'Europe/Rome').utc()
      const blockEnd = moment.tz(formData.end_time, 'Europe/Rome').utc()
      
      // Check if any existing block uses this commentator during an overlapping time period
      return !allBlocks.some(block => {
        // Skip if block has no time range
        if (!block.start_time || !block.end_time) return false
        
        // Check if this block uses the commentator
        const hasCommentator = block.commentators && block.commentators.some(c => c.id === commentatorId)
        if (!hasCommentator) return false
        
        // Check for time overlap
        const existingStart = moment.utc(block.start_time)
        const existingEnd = moment.utc(block.end_time)
        
        // Two time ranges overlap if: start1 < end2 && start2 < end1
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, allBlocks])

  // Check if an encoder is available during the block's time range
  const isEncoderAvailable = useMemo(() => {
    return (encoderId) => {
      if (!formData.start_time || !formData.end_time || !encoderId) return true
      
      const blockStart = moment.tz(formData.start_time, 'Europe/Rome').utc()
      const blockEnd = moment.tz(formData.end_time, 'Europe/Rome').utc()
      
      // Check if any existing block uses this encoder during an overlapping time period
      return !allBlocks.some(block => {
        // Skip if block has no time range
        if (!block.start_time || !block.end_time) return false
        
        // Check if this block uses the encoder
        const hasEncoder = block.encoder_id === encoderId
        if (!hasEncoder) return false
        
        // Check for time overlap
        const existingStart = moment.utc(block.start_time)
        const existingEnd = moment.utc(block.end_time)
        
        // Two time ranges overlap if: start1 < end2 && start2 < end1
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, allBlocks])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)

      if (!formData.name || !formData.start_time || !formData.end_time) {
        throw new Error('Name, start time, and end time are required')
      }

      // Convert datetime-local values (interpreted as Milan time) to UTC ISO strings
      const convertMilanToUTC = (milanDateTimeLocal) => {
        if (!milanDateTimeLocal) return null
        // Parse the datetime-local value as Milan time and convert to UTC
        return moment.tz(milanDateTimeLocal, 'Europe/Rome').utc().toISOString()
      }

      const blockData = {
        name: formData.name,
        obs_id: formData.obs_id || null,
        start_time: convertMilanToUTC(formData.start_time),
        end_time: convertMilanToUTC(formData.end_time),
        broadcast_start_time: convertMilanToUTC(formData.broadcast_start_time),
        broadcast_end_time: convertMilanToUTC(formData.broadcast_end_time),
        encoder_id: formData.encoder_id || null,
        producer_id: formData.producer_id || null,
        suite_id: formData.suite_id || null,
        source_event_id: event?.id || null,
        obs_group: event?.group || null, // Store the DX channel from OBS event
        type: formData.type && formData.type.trim() ? formData.type.trim() : null,
        canadian_content: formData.canadian_content || false
      }

       const newBlock = await createBlock(blockData)
      
      // Add commentator relationships
      try {
        if (commentatorSelections.pxp) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.pxp, 'PxP')
        }
        if (commentatorSelections.color) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.color, 'Color')
        }
        if (commentatorSelections.spare) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.spare, 'Spare')
        }
        
        // Add booth relationships and corresponding network labels
        // Each booth is linked to a specific network via network_id in block_booths
        // Track which networks we've already added to avoid duplicates
        const addedNetworks = new Set()
        
        const addBoothWithNetwork = async (boothId, networkLabel) => {
          if (boothId) {
            // Flexible network matching to handle database name variations
            // Database has: 'CBC TV', 'Gem', 'R-C TV / Web'
            // We're looking for: 'CBC TV', 'CBC Gem', 'R-C TV/WEB'
            const network = networks.find(n => {
              if (!n.name) return false
              const nameLower = n.name.toLowerCase().trim()
              const labelLower = networkLabel.toLowerCase().trim()
              
              // Exact match first
              if (n.name === networkLabel) return true
              
              // CBC TV matching
              if (labelLower === 'cbc tv' && (nameLower === 'cbc tv' || nameLower.includes('cbc tv'))) {
                return true
              }
              
              // CBC Gem matching - database has 'Gem', we're looking for 'CBC Gem'
              if (labelLower === 'cbc gem' || labelLower === 'cbc web') {
                return nameLower === 'cbc gem' || 
                       nameLower === 'cbc web' ||
                       nameLower === 'gem' || 
                       nameLower === 'web' ||
                       nameLower.includes('cbc gem') ||
                       nameLower.includes('cbc web')
              }
              
              // R-C TV/Web matching - database has 'R-C TV / Web', we're looking for 'R-C TV/WEB'
              if (labelLower.includes('r-c') || labelLower.includes('rc tv')) {
                return nameLower.includes('r-c') || 
                       nameLower.includes('rc tv') || 
                       nameLower.includes('radio-canada')
              }
              
              return false
            })
            
             if (network && network.id) {
               // Add booth relationship with network_id to link booth to this specific network
               await addBlockRelationship(newBlock.id, 'booths', boothId, null, network.id)
               // Also add the network relationship, but only once per network
               if (!addedNetworks.has(network.id)) {
                 try {
                   await addBlockRelationship(newBlock.id, 'networks', network.id)
                   addedNetworks.add(network.id)
                 } catch (err) {
                   // If network already exists (409), that's fine - just continue
                   if (err.message && err.message.includes('409')) {
                     addedNetworks.add(network.id)
                   } else {
                     throw err
                   }
                 }
               }
             } else {
               throw new Error(`Network not found for label "${networkLabel}". Available networks: ${networks.map(n => n.name).join(', ')}`)
             }
          }
        }
        
        if (boothSelections.cbcTv) {
          await addBoothWithNetwork(boothSelections.cbcTv, networkLabels.cbcTv)
        }
        if (boothSelections.cbcWeb) {
          await addBoothWithNetwork(boothSelections.cbcWeb, networkLabels.cbcWeb)
        }
        if (boothSelections.rcTvWeb) {
          await addBoothWithNetwork(boothSelections.rcTvWeb, networkLabels.rcTvWeb)
        }
      } catch (relError) {
        // Block was created but relationships failed - log but don't fail the whole operation
        console.error('Error adding relationships:', relError)
        // Still show success since block was created
      }
      
      if (onSuccess) {
        onSuccess()
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add block to CBC timeline')
      console.error('Error creating block:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!event) {
    return null
  }

  return (
    <div className="h-full bg-white border-l border-gray-300 shadow-lg flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Add to CBC Timeline</h2>
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
                    const startDate = formData.start_time.split('T')[0]
                    return `${startDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    if (!formData.broadcast_start_time && formData.start_time) {
                      const startMoment = moment.tz(formData.start_time, 'Europe/Rome')
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
                    const endDate = formData.end_time.split('T')[0]
                    return `${endDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    if (!formData.broadcast_end_time && formData.end_time) {
                      const endMoment = moment.tz(formData.end_time, 'Europe/Rome')
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
                  {encoders.map(e => {
                    const available = isEncoderAvailable(e.id)
                    return (
                      <option 
                        key={e.id} 
                        value={e.id}
                        disabled={!available}
                        style={{ color: available ? 'inherit' : '#9ca3af' }}
                      >
                        {e.name}{!available ? ' (Unavailable)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              
              {/* Booths - networks are automatically added based on booth selection */}
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">CBC TV - Booth</label>
                  <select
                    value={boothSelections.cbcTv}
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcTv: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {sortedBooths.map(b => {
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
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcWeb: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {sortedBooths.map(b => {
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
                    onChange={(e) => setBoothSelections({ ...boothSelections, rcTvWeb: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {sortedBooths.map(b => {
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
              </div>
              
              {/* Commentators */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('commentators')}
                  className="flex items-center gap-2 w-full text-left text-sm font-medium mb-1 hover:text-gray-700"
                >
                  <span className={`transform transition-transform ${expandedSections.commentators ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span>Commentators</span>
                </button>
                {expandedSections.commentators && (
                  <div className="space-y-2 ml-6">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">PxP</label>
                      <select
                        value={commentatorSelections.pxp}
                        onChange={(e) => setCommentatorSelections({ ...commentatorSelections, pxp: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">None</option>
                        {commentators.map(c => {
                          const available = isCommentatorAvailable(c.id)
                          return (
                            <option 
                              key={c.id} 
                              value={c.id}
                              disabled={!available}
                              style={{ color: available ? 'inherit' : '#9ca3af' }}
                            >
                              {c.name}{!available ? ' (Unavailable)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Color</label>
                      <select
                        value={commentatorSelections.color}
                        onChange={(e) => setCommentatorSelections({ ...commentatorSelections, color: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">None</option>
                        {commentators.map(c => {
                          const available = isCommentatorAvailable(c.id)
                          return (
                            <option 
                              key={c.id} 
                              value={c.id}
                              disabled={!available}
                              style={{ color: available ? 'inherit' : '#9ca3af' }}
                            >
                              {c.name}{!available ? ' (Unavailable)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Spare</label>
                      <select
                        value={commentatorSelections.spare}
                        onChange={(e) => setCommentatorSelections({ ...commentatorSelections, spare: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">None</option>
                        {commentators.map(c => {
                          const available = isCommentatorAvailable(c.id)
                          return (
                            <option 
                              key={c.id} 
                              value={c.id}
                              disabled={!available}
                              style={{ color: available ? 'inherit' : '#9ca3af' }}
                            >
                              {c.name}{!available ? ' (Unavailable)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Producer */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('producer')}
                  className="flex items-center gap-2 w-full text-left text-sm font-medium mb-1 hover:text-gray-700"
                >
                  <span className={`transform transition-transform ${expandedSections.producer ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span>Producer</span>
                </button>
                {expandedSections.producer && (
                  <div className="ml-6">
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
                )}
              </div>
              
              {/* Suite */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('suite')}
                  className="flex items-center gap-2 w-full text-left text-sm font-medium mb-1 hover:text-gray-700"
                >
                  <span className={`transform transition-transform ${expandedSections.suite ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span>Suite</span>
                </button>
                {expandedSections.suite && (
                  <div className="ml-6">
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
                )}
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add to CBC Timeline'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default AddToCBCForm
