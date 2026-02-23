import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import moment from 'moment-timezone'
import { getResources } from '../utils/api'
import { getDemoBoothsByCity } from '../utils/demoLiveBooths'
import { isSharedBooth } from '../utils/boothConstants'

function LiveBoothsView() {
  const navigate = useNavigate()
  const [booths, setBooths] = useState([])
  const [currentTime, setCurrentTime] = useState(moment())
  const [selectedCity, setSelectedCity] = useState('toronto')

  // Load booths from API
  useEffect(() => {
    getResources('booths').then(data => setBooths(Array.isArray(data) ? data : [])).catch(() => setBooths([]))
  }, [])

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(moment()), 1000)
    return () => clearInterval(interval)
  }, [])

  // All booths for city: demo booths (with commentators) + API booths (empty)
  const boothsWithBlocksFiltered = useMemo(() => {
    const prefix = selectedCity === 'toronto' ? 'VT ' : 'VM '
    const apiBooths = booths
      .filter(b => !isSharedBooth(b) && (b.name || '').startsWith(prefix))
      .sort((a, b) => {
        const aNum = parseInt((a.name || '').match(/\d+/)?.[0] || '999', 10)
        const bNum = parseInt((b.name || '').match(/\d+/)?.[0] || '999', 10)
        return aNum - bNum
      })

    const demoForCity = getDemoBoothsByCity(selectedCity)
    const demoNames = new Set(demoForCity.map(d => d.name))

    const result = []
    const seen = new Set()

    // Add demo booths first (VT/VM 51–53 with commentators)
    demoForCity.forEach(demo => {
      seen.add(demo.name)
      result.push({
        booth: { id: demo.id, name: demo.name },
        blocks: [{ name: demo.eventTitle }],
        commentators: demo.commentators.map((c, i) => ({ id: `c-${i}`, name: c.name, role: c.role }))
      })
    })

    // Add remaining API booths (no commentators)
    apiBooths.forEach(b => {
      if (seen.has(b.name)) return
      seen.add(b.name)
      result.push({
        booth: { id: b.id, name: b.name },
        blocks: [],
        commentators: []
      })
    })

    return result.sort((a, b) => {
      const aNum = parseInt((a.booth.name || '').match(/\d+/)?.[0] || '999', 10)
      const bNum = parseInt((b.booth.name || '').match(/\d+/)?.[0] || '999', 10)
      return aNum - bNum
    })
  }, [booths, selectedCity])

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

  return (
    <div className="h-full bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Booth Summary</h1>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedCity('toronto')}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  selectedCity === 'toronto'
                    ? 'bg-emerald-500/30 text-white border border-emerald-400/50'
                    : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                }`}
              >
                Toronto
              </button>
              <button
                type="button"
                onClick={() => setSelectedCity('montreal')}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  selectedCity === 'montreal'
                    ? 'bg-emerald-500/30 text-white border border-emerald-400/50'
                    : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                }`}
              >
                Montreal
              </button>
            </div>
          </div>
          <div className="flex items-center">
                <div className="text-3xl font-bold text-white font-mono">
                  {times.et} <span className="font-bold">ET</span>
                </div>
                <span className="text-3xl font-bold text-white mx-4" style={{ transform: 'translateY(-2px)' }}>/</span>
                <div className="text-3xl font-bold text-white font-mono">
                  {times.cet} CET
                </div>
              </div>
        </div>
      </div>

      {/* Booth Grid */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-4">
            {boothsWithBlocksFiltered.map((boothData) => {
              const eventName = getEventName(boothData)
              const displayCommentators = getDisplayCommentators(boothData)

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
      </div>
    </div>
  )
}

export default LiveBoothsView
