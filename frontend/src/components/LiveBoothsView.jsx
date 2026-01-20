import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBlocks, getResources } from '../utils/api'
import { realtimeManager } from '../utils/realtimeManager'
import moment from 'moment-timezone'

function LiveBoothsView() {
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState([])
  const [booths, setBooths] = useState([])
  const [commentators, setCommentators] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(moment())

  // Update current time every second for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(moment())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  // Real-time subscriptions - replaces polling
  useEffect(() => {
    // Subscribe to all relevant tables
    const unsubscribers = [
      realtimeManager.subscribe('blocks', () => loadData()),
      realtimeManager.subscribe('block_booths', () => loadData()),
      realtimeManager.subscribe('block_commentators', () => loadData()),
      realtimeManager.subscribe('block_networks', () => loadData()),
      realtimeManager.subscribe('booths', () => loadData()),
      realtimeManager.subscribe('commentators', () => loadData()),
    ]
    
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [blocksData, boothsData, commentatorsData] = await Promise.all([
        getBlocks(),
        getResources('booths'),
        getResources('commentators')
      ])
      setBlocks(blocksData || [])
      setBooths(boothsData || [])
      setCommentators(commentatorsData || [])
    } catch (err) {
      setError(err.message)
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter for live blocks (current time is between start_time and end_time)
  // Exclude VIS booths
  const liveBlocks = useMemo(() => {
    const now = currentTime.utc()
    
    return blocks.filter(block => {
      if (!block.start_time || !block.end_time) return false
      
      const start = moment.utc(block.start_time)
      const end = moment.utc(block.end_time)
      
      // Check if current time is within block time range
      const isLive = now.isAfter(start) && now.isBefore(end)
      
      if (!isLive) return false
      
      // Exclude blocks with VIS booths
      if (block.booths && block.booths.length > 0) {
        const hasVisBooth = block.booths.some(booth => booth.name === 'VIS')
        if (hasVisBooth) return false
      }
      
      return true
    })
  }, [blocks, currentTime])

  // Group live blocks by booth
  // Each booth can have multiple blocks (different networks), but we'll show the primary one
  const boothsWithBlocks = useMemo(() => {
    const boothMap = new Map()
    
    // Initialize all booths (excluding VIS) - show all booths even if no live blocks
    booths.forEach(booth => {
      if (booth.name !== 'VIS') {
        boothMap.set(booth.id, {
          booth: booth,
          blocks: [],
          commentators: []
        })
      }
    })
    
    // Add blocks to their booths
    liveBlocks.forEach(block => {
      if (block.booths && block.booths.length > 0) {
        block.booths.forEach(booth => {
          if (booth.name !== 'VIS' && boothMap.has(booth.id)) {
            const boothData = boothMap.get(booth.id)
            boothData.blocks.push(block)
            
            // Collect commentators from this block
            if (block.commentators && block.commentators.length > 0) {
              block.commentators.forEach(commentator => {
                // Avoid duplicates
                const exists = boothData.commentators.some(c => c.id === commentator.id)
                if (!exists) {
                  boothData.commentators.push(commentator)
                }
              })
            }
          }
        })
      }
    })
    
    // Convert to array and sort by booth name (VT51, VT52, etc.)
    return Array.from(boothMap.values()).sort((a, b) => {
      const aNum = parseInt(a.booth.name.match(/\d+/)?.[0] || '999', 10)
      const bNum = parseInt(b.booth.name.match(/\d+/)?.[0] || '999', 10)
      return aNum - bNum
    })
  }, [liveBlocks, booths])

  // Get the three primary commentators for a booth
  // Show assigned commentators, or show all available commentators with status
  const getDisplayCommentators = (boothData) => {
    const assignedCommentators = boothData.commentators || []
    
    // If there are assigned commentators, show them (up to 3)
    if (assignedCommentators.length > 0) {
      const display = []
      
      // Try to get PxP, Color, Spare in that order
      const pxp = assignedCommentators.find(c => c.role === 'PxP')
      const color = assignedCommentators.find(c => c.role === 'Color')
      const spare = assignedCommentators.find(c => c.role === 'Spare')
      
      // Fill remaining slots with other assigned commentators
      const others = assignedCommentators.filter(c => 
        c.role !== 'PxP' && c.role !== 'Color' && c.role !== 'Spare'
      )
      
      if (pxp) display.push(pxp)
      if (color) display.push(color)
      if (spare) display.push(spare)
      
      // Add others up to 3 total
      while (display.length < 3 && others.length > 0) {
        display.push(others.shift())
      }
      
      // Pad to 3 if needed
      while (display.length < 3) {
        display.push(null)
      }
      
      return display.slice(0, 3)
    }
    
    // If no assigned commentators, show empty slots
    return [null, null, null]
  }

  // Get primary event name for a booth (from the first block)
  const getEventName = (boothData) => {
    if (boothData.blocks.length === 0) return ''
    return boothData.blocks[0].name || ''
  }

  // Format time for display (EST and ITA)
  const formatTime = () => {
    const et = currentTime.clone().tz('America/New_York')
    const ita = currentTime.clone().tz('Europe/Rome')
    return {
      et: et.format('HH:mm:ss'),
      cet: ita.format('HH:mm:ss')
    }
  }

  const times = formatTime()

  if (loading && blocks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading live booths...</div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Booth Summary</h1>
          <div className="flex items-center">
            <div className="text-3xl font-bold text-white font-mono">
              {times.et} <span className="font-bold">EST</span>
            </div>
            <span className="text-3xl font-bold text-white mx-4" style={{ transform: 'translateY(-2px)' }}>/</span>
            <div className="text-3xl font-bold text-white font-mono">
              {times.cet} ITA
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-900 border border-red-700 text-red-200 rounded">
          {error}
        </div>
      )}

      {/* Booth Grid */}
      <div className="p-4">
        {boothsWithBlocks.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No booths available
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {boothsWithBlocks.map((boothData) => {
              const eventName = getEventName(boothData)
              const displayCommentators = getDisplayCommentators(boothData)
              const hasBlocks = boothData.blocks.length > 0

              return (
                <div
                  key={boothData.booth.id}
                  className="bg-gray-700 rounded-lg p-4 border border-gray-600 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => navigate(`/live-booths/${boothData.booth.id}`)}
                >
                  {/* Event Name */}
                  <div className="text-lg font-semibold mb-3 text-white min-h-[1.5rem]" style={{ fontSize: '1.4em' }}>
                    {eventName || '—'}
                  </div>

                  {/* Commentators */}
                  <div className="space-y-4 mb-3">
                    {displayCommentators.map((commentator, index) => {
                      const isActive = commentator !== null
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div
                            className={`rounded-full flex-shrink-0 ${
                              isActive ? 'bg-red-500' : 'bg-gray-500'
                            }`}
                            style={{ width: '1.125rem', height: '1.125rem' }}
                          />
                          <span
                            className={`text-sm ${
                              isActive ? 'text-white' : 'text-gray-400'
                            }`}
                            style={{ fontSize: '1.75em' }}
                          >
                            {commentator ? commentator.name : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Booth ID */}
                  <div className="text-3xl font-bold text-white mt-4">
                    {boothData.booth.name}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveBoothsView
