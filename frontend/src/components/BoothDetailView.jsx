import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBlocks, getResources } from '../utils/api'
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
    // Refresh data every 30 seconds
    const refreshInterval = setInterval(() => {
      loadData()
    }, 30000)

    return () => clearInterval(refreshInterval)
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

  // Format event time range
  const formatEventTime = () => {
    if (!primaryBlock || !primaryBlock.start_time || !primaryBlock.end_time) return ''
    
    const start = moment.utc(primaryBlock.start_time).tz('America/New_York')
    const end = moment.utc(primaryBlock.end_time).tz('America/New_York')
    
    return `[${start.format('HHmm')} - ${end.format('HHmm')} ET]`
  }

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
    <div className="h-full bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="bg-black p-4 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold" style={{ fontSize: '1.4em' }}>Booth {booth.name}</h1>
          <div className="flex items-center" style={{ gap: '50px' }}>
            <div className="text-3xl font-bold text-white" style={{ fontSize: '1.4em' }}>
              {times.et} <span className="font-bold">EST</span>
            </div>
            <div className="text-3xl font-bold text-white" style={{ fontSize: '1.4em' }}>
              {times.cet} ITA
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-900 border border-red-700 text-red-200 rounded" style={{ fontSize: '1.4em' }}>
          {error}
        </div>
      )}

      {/* Event Details Section */}
      <div className="bg-gray-700 p-6 m-4 rounded-lg">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-2" style={{ fontSize: '1.4em' }}>{primaryBlock.name}</h2>
            <div className="text-lg text-gray-300 mb-2" style={{ fontSize: '1.4em' }}>
              {formatEventTime()}
            </div>
          </div>
          <div className="bg-gray-600 p-4 rounded" style={{ fontSize: '1.4em' }}>
            {primaryBlock.producer && (
              <div className="mb-2">
                <span className="font-semibold">Producer: </span>
                {primaryBlock.producer.name}
              </div>
            )}
            {primaryBlock.suite && (
              <div>
                <span className="font-semibold">Suite: </span>
                {primaryBlock.suite.name}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personnel Section */}
      <div className="bg-gray-800 p-6 m-4 rounded-lg">
        <div className="grid grid-cols-3 gap-6">
          {/* PxP */}
          <div className="text-center">
            <div className="text-lg font-semibold mb-2" style={{ fontSize: '1.4em' }}>PxP</div>
            <div className="text-xl mb-4" style={{ fontSize: '1.4em' }}>
              {commentators.pxp ? commentators.pxp.name : 'TBD'}
            </div>
            <div className="flex justify-center">
              <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '8.4rem', height: '8.4rem', borderWidth: '0.56rem' }}>
                <span className="text-white font-bold" style={{ fontSize: '1.4em' }}>LIVE</span>
              </div>
            </div>
          </div>

          {/* COLOR */}
          <div className="text-center">
            <div className="text-lg font-semibold mb-2" style={{ fontSize: '1.4em' }}>COLOR</div>
            <div className="text-xl mb-4" style={{ fontSize: '1.4em' }}>
              {commentators.color ? commentators.color.name : 'TBD'}
            </div>
            <div className="flex justify-center">
              <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '8.4rem', height: '8.4rem', borderWidth: '0.56rem' }}>
                <span className="text-white font-bold" style={{ fontSize: '1.4em' }}>LIVE</span>
              </div>
            </div>
          </div>

          {/* SPARE - only show if there's a commentator */}
          {commentators.spare && (
            <div className="text-center">
              <div className="text-lg font-semibold mb-2" style={{ fontSize: '1.4em' }}>SPARE</div>
              <div className="text-xl mb-4" style={{ fontSize: '1.4em' }}>{commentators.spare.name}</div>
              <div className="flex justify-center">
                <div className="rounded-full border-white bg-red-600 flex items-center justify-center" style={{ width: '8.4rem', height: '8.4rem', borderWidth: '0.56rem' }}>
                  <span className="text-white font-bold" style={{ fontSize: '1.4em' }}>LIVE</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Output Status Section */}
      <div className="bg-black p-4 m-4 rounded-lg">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold" style={{ fontSize: '1.4em' }}>OUTPUT</span>
          <div className="flex items-center gap-4">
            {networks.map((network) => {
              const networkName = network.displayName || network.name
              const isActive = true // All networks shown are active (live block)
              
              return (
                <div key={network.id} className="flex items-center gap-2">
                  <span className="text-white" style={{ fontSize: '1.4em', lineHeight: '1.05rem', display: 'inline-block' }}>{networkName}</span>
                  <div
                    className={`rounded-full flex-shrink-0 ${
                      isActive ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                    style={{ width: '1.05rem', height: '1.05rem' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="m-4">
        <button
          onClick={() => navigate('/live-booths')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          style={{ fontSize: '1.4em' }}
        >
          Back to Live Booths
        </button>
      </div>
    </div>
  )
}

export default BoothDetailView
