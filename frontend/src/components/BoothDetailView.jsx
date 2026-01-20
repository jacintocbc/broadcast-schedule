import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBlocks, getResources } from '../utils/api'
import { realtimeManager } from '../utils/realtimeManager'
import moment from 'moment-timezone'

function BoothDetailView() {
  const { boothId } = useParams()
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState([])
  const [booths, setBooths] = useState([])
  const [currentTime, setCurrentTime] = useState(moment())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Update current time every second for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(moment())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Load data
  useEffect(() => {
    loadData()
  }, [boothId])

  // Real-time subscriptions - replaces polling
  useEffect(() => {
    const unsubscribers = [
      realtimeManager.subscribe('blocks', () => loadData()),
      realtimeManager.subscribe('block_booths', () => loadData()),
      realtimeManager.subscribe('block_commentators', () => loadData()),
      realtimeManager.subscribe('block_networks', () => loadData()),
      realtimeManager.subscribe('booths', () => loadData()),
    ]
    
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [boothId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [blocksData, boothsData] = await Promise.all([
        getBlocks(),
        getResources('booths')
      ])
      setBlocks(blocksData || [])
      setBooths(boothsData || [])
    } catch (err) {
      setError(err.message)
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Find the booth
  const booth = useMemo(() => {
    return booths.find(b => b.id === boothId)
  }, [booths, boothId])

  // Find live blocks for this booth (excluding VIS)
  const liveBlocks = useMemo(() => {
    if (!booth || booth.name === 'VIS') return []
    
    const now = currentTime.utc()
    
    return blocks.filter(block => {
      if (!block.start_time || !block.end_time) return false
      
      const start = moment.utc(block.start_time)
      const end = moment.utc(block.end_time)
      
      // Check if current time is within block time range
      const isLive = now.isAfter(start) && now.isBefore(end)
      
      if (!isLive) return false
      
      // Check if this booth is assigned to this block
      if (block.booths && block.booths.length > 0) {
        return block.booths.some(b => b.id === boothId)
      }
      
      return false
    })
  }, [blocks, boothId, currentTime, booth])

  // Get the primary block (first one if multiple)
  const primaryBlock = liveBlocks.length > 0 ? liveBlocks[0] : null

  // Get commentators by role
  const commentators = useMemo(() => {
    if (!primaryBlock || !primaryBlock.commentators) {
      return { pxp: null, color: null, spare: null }
    }
    
    const pxp = primaryBlock.commentators.find(c => c.role === 'PxP')
    const color = primaryBlock.commentators.find(c => c.role === 'Color')
    const spare = primaryBlock.commentators.find(c => c.role === 'Spare')
    
    return { pxp, color, spare }
  }, [primaryBlock])

  // Get networks assigned to this booth
  // Networks come from the block's booth assignments (booth.network)
  const networks = useMemo(() => {
    if (!primaryBlock || !primaryBlock.booths) return []
    
    // Find booth assignments for this specific booth
    const boothAssignments = primaryBlock.booths.filter(b => b.id === boothId)
    
    // Get networks associated with this booth from booth assignments
    const networkList = []
    boothAssignments.forEach(boothAssignment => {
      if (boothAssignment.network) {
        networkList.push(boothAssignment.network)
      }
    })
    
    // Remove duplicates
    const uniqueNetworks = networkList.filter((network, index, self) =>
      index === self.findIndex(n => n.id === network.id)
    )
    
    // Filter to only show CBC TV, CBC Gem, R-C TV/Web
    // Map network names to display names
    const allowedNetworks = ['CBC TV', 'CBC Gem', 'Gem', 'R-C TV/Web', 'R-C TV / Web']
    return uniqueNetworks
      .filter(n => {
        const nameLower = n.name.toLowerCase()
        return allowedNetworks.some(allowed => {
          const allowedLower = allowed.toLowerCase()
          return nameLower === allowedLower || 
                 nameLower.includes(allowedLower) || 
                 allowedLower.includes(nameLower)
        })
      })
      .map(n => {
        // Normalize display names
        if (n.name === 'Gem' || n.name.toLowerCase().includes('gem')) {
          return { ...n, displayName: 'CBC Gem' }
        }
        if (n.name.toLowerCase().includes('r-c') || n.name.toLowerCase().includes('radio-canada')) {
          return { ...n, displayName: 'R-C TV/Web' }
        }
        return { ...n, displayName: n.name }
      })
  }, [primaryBlock, boothId])

  // Format time for display (EST and CET)
  const formatTime = () => {
    const et = currentTime.clone().tz('America/New_York')
    const cet = currentTime.clone().tz('Europe/Rome')
    return {
      et: et.format('HH:mm:ss'),
      cet: cet.format('HH:mm:ss')
    }
  }

  const times = formatTime()

  // Format event time range
  const formatEventTime = () => {
    if (!primaryBlock || !primaryBlock.start_time || !primaryBlock.end_time) return ''
    
    const start = moment.utc(primaryBlock.start_time).tz('America/New_York')
    const end = moment.utc(primaryBlock.end_time).tz('America/New_York')
    
    return `[${start.format('HHmm')} - ${end.format('HHmm')} ET]`
  }

  // Parse country codes from event name (e.g., "CUR11 CAN-SWE Mixed Doubles" -> ["CAN", "SWE"])
  const parseCountryCodes = (eventName) => {
    if (!eventName) return null
    
    // Look for patterns like "CAN-SWE", "CAN vs SWE", "CAN/SWE", etc.
    const patterns = [
      /([A-Z]{3})[-–—]([A-Z]{3})/,  // CAN-SWE, CAN–SWE, CAN—SWE
      /([A-Z]{3})\s+vs\.?\s+([A-Z]{3})/i,  // CAN vs SWE, CAN vs. SWE
      /([A-Z]{3})\s*\/\s*([A-Z]{3})/,  // CAN/SWE
    ]
    
    for (const pattern of patterns) {
      const match = eventName.match(pattern)
      if (match && match[1] && match[2]) {
        return [match[1].toUpperCase(), match[2].toUpperCase()]
      }
    }
    
    return null
  }

  // Get flag filename for country code (flags are stored as 3-letter codes with .jpg extension)
  const getFlagFilename = (countryCode) => {
    // Flags are stored with 3-letter codes (e.g., CAN.jpg, SWE.jpg)
    // If it's already a 3-letter code, use it directly
    if (countryCode.length === 3) {
      return countryCode.toUpperCase()
    }
    
    // If it's a 2-letter code, we'd need to map it, but for now assume 3-letter codes
    // This function can be extended if needed
    return countryCode.toUpperCase()
  }

  // Get country codes and flags for display
  const countryMatch = useMemo(() => {
    if (!primaryBlock) return null
    const codes = parseCountryCodes(primaryBlock.name)
    if (!codes || codes.length !== 2) return null
    
    return {
      code1: codes[0],
      code2: codes[1],
      flagUrl1: `/flags/${getFlagFilename(codes[0])}.jpg`,
      flagUrl2: `/flags/${getFlagFilename(codes[1])}.jpg`
    }
  }, [primaryBlock])

  if (loading && blocks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-gray-400">Loading booth details...</div>
      </div>
    )
  }

  if (!booth) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-gray-400 mb-4">Booth not found</div>
          <button
            onClick={() => navigate('/live-booths')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Live Booths
          </button>
        </div>
      </div>
    )
  }

  if (!primaryBlock) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-gray-400 mb-4">No live block for this booth</div>
          <button
            onClick={() => navigate('/live-booths')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Live Booths
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black p-8 shadow-lg flex-shrink-0">
        <div className="flex justify-between items-center">
          <h1 className="font-bold" style={{ fontSize: '4.2rem' }}>Booth {booth.name}</h1>
          <div className="flex items-center">
            <div className="font-bold text-white font-mono" style={{ fontSize: '4.2rem' }}>
              {times.et} <span className="font-bold">EST</span>
            </div>
            <span className="font-bold text-white mx-8" style={{ fontSize: '4.2rem', transform: 'translateY(-2px)' }}>/</span>
            <div className="font-bold text-white font-mono" style={{ fontSize: '4.2rem' }}>
              {times.cet} CET
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 my-4 p-4 bg-red-900 border border-red-700 text-red-200 rounded text-2xl">
          {error}
        </div>
      )}

      {/* Main Content - Flex to fill remaining space */}
      <div className="flex-1 flex flex-col justify-between p-6 gap-6 overflow-y-auto">
        {/* Event Details Section */}
        <div className="bg-gray-700 p-6 rounded-lg flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="font-bold mb-4" style={{ fontSize: '3.312rem' }}>{primaryBlock.name}</h2>
              {countryMatch && (
                <div className="font-semibold mb-3 flex items-center gap-4" style={{ fontSize: '2.25rem' }}>
                  <img 
                    src={countryMatch.flagUrl1} 
                    alt={countryMatch.code1}
                    className="inline-block"
                    style={{ width: '3em', height: '2.25em', objectFit: 'cover', verticalAlign: 'middle' }}
                  />
                  <span>{countryMatch.code1}</span>
                  <span>vs.</span>
                  <img 
                    src={countryMatch.flagUrl2} 
                    alt={countryMatch.code2}
                    className="inline-block"
                    style={{ width: '3em', height: '2.25em', objectFit: 'cover', verticalAlign: 'middle' }}
                  />
                  <span>{countryMatch.code2}</span>
                </div>
              )}
              <div className="text-gray-300" style={{ fontSize: '2.52rem' }}>
                {formatEventTime()}
              </div>
            </div>
            <div className="bg-gray-600 p-6 rounded-lg ml-8">
              {primaryBlock.producer && (
                <div className="mb-3" style={{ fontSize: '2.52rem' }}>
                  <span className="font-semibold">Producer: </span>
                  {primaryBlock.producer.name}
                </div>
              )}
              {primaryBlock.suite && (
                <div style={{ fontSize: '2.52rem' }}>
                  <span className="font-semibold">Suite: </span>
                  {primaryBlock.suite.name}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Personnel Section */}
        <div className="bg-gray-800 p-6 rounded-lg flex-1 flex items-center">
          <div className="grid grid-cols-3 gap-14 w-full">
            {/* PxP */}
            <div className="text-center">
              <div className="font-semibold mb-1" style={{ fontSize: '3.15rem' }}>PxP</div>
              <div className="mb-3" style={{ fontSize: '3.15rem' }}>
                {commentators.pxp ? commentators.pxp.name : 'TBD'}
              </div>
              <div className="flex justify-center">
                <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '9.8rem', height: '9.8rem', borderWidth: '0.75rem' }}>
                  <span className="text-white font-bold" style={{ fontSize: '2.5rem' }}>LIVE</span>
                </div>
              </div>
            </div>

            {/* COLOR */}
            <div className="text-center">
              <div className="font-semibold mb-1" style={{ fontSize: '3.15rem' }}>COLOR</div>
              <div className="mb-3" style={{ fontSize: '3.15rem' }}>
                {commentators.color ? commentators.color.name : 'TBD'}
              </div>
              <div className="flex justify-center">
                <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '9.8rem', height: '9.8rem', borderWidth: '0.75rem' }}>
                  <span className="text-white font-bold" style={{ fontSize: '2.5rem' }}>LIVE</span>
                </div>
              </div>
            </div>

            {/* SPARE - only show if there's a commentator */}
            {commentators.spare && (
              <div className="text-center">
                <div className="font-semibold mb-1" style={{ fontSize: '3.15rem' }}>SPARE</div>
                <div className="mb-3" style={{ fontSize: '3.15rem' }}>{commentators.spare.name}</div>
                <div className="flex justify-center">
                  <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '9.8rem', height: '9.8rem', borderWidth: '0.75rem' }}>
                    <span className="text-white font-bold" style={{ fontSize: '2.5rem' }}>LIVE</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Output Status Section */}
        <div className="bg-black p-5 rounded-lg flex-shrink-0">
          <div className="flex items-center gap-10">
            <span className="font-semibold" style={{ fontSize: '3.6rem' }}>OUTPUT</span>
            <div className="flex items-center gap-7">
              {networks.map((network) => {
                const networkName = network.displayName || network.name
                const isActive = true // All networks shown are active (live block)
                
                return (
                  <div key={network.id} className="flex items-center gap-4">
                    <span className="text-white" style={{ fontSize: '2.4rem' }}>{networkName}</span>
                    <div
                      className={`rounded-full flex-shrink-0 ${
                        isActive ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                      style={{ width: '1.8rem', height: '1.8rem' }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BoothDetailView
