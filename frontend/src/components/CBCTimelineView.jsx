import { useState, useEffect, useRef, useMemo } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import BlockEditor from './BlockEditor'
import { getBlocks, getResources } from '../utils/api'
import { BLOCK_TYPES, BLOCK_TYPE_COLORS, DEFAULT_BLOCK_COLOR, darkenColor } from '../utils/blockTypes'
import moment from 'moment'

function CBCTimelineView() {
  const [blocks, setBlocks] = useState([])
  const [encoders, setEncoders] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const datePickerRef = useRef(null)
  const [datePickerHeight, setDatePickerHeight] = useState(0)
  const [zoomHours, setZoomHours] = useState(24) // 1, 3, 8, or 24 hours
  const [scrollPosition, setScrollPosition] = useState(0) // Current scroll position in hours

  // Fetch blocks and encoders
  useEffect(() => {
    loadBlocks()
    loadEncoders()
  }, [])

  const loadEncoders = async () => {
    try {
      const data = await getResources('encoders')
      // Sort encoders: TX 01 - TX 27
      const sorted = data.sort((a, b) => {
        const aNum = parseInt(a.name.match(/\d+/)?.[0] || '999', 10)
        const bNum = parseInt(b.name.match(/\d+/)?.[0] || '999', 10)
        return aNum - bNum
      })
      setEncoders(sorted)
    } catch (err) {
      console.error('Error loading encoders:', err)
    }
  }

  // Update available dates when blocks change
  useEffect(() => {
    const dates = [...new Set(blocks.map(block => moment(block.start_time).format('YYYY-MM-DD')))].sort()
    setAvailableDates(dates)
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0])
    }
  }, [blocks])

  // Filter blocks by selected date
  const filteredBlocks = selectedDate 
    ? blocks.filter(block => moment(block.start_time).format('YYYY-MM-DD') === selectedDate)
    : []

  // Transform blocks to events format for ModernTimeline and ensure all encoders are shown
  const events = useMemo(() => {
    // Transform blocks to events format
    const blockEvents = filteredBlocks.map(block => ({
      id: block.id,
      title: block.name,
      group: block.encoder?.name || 'No Encoder',
      start_time: block.start_time,
      end_time: block.end_time,
      block: block // Store full block data
    }))

    // Create events array starting with actual block events
    const eventsList = [...blockEvents]

    // Ensure all encoders are included in the groups by adding empty placeholder events
    // This ensures all encoder rows are shown
    if (encoders.length > 0) {
      const encoderNames = new Set(encoders.map(e => e.name))
      const existingGroups = new Set(blockEvents.map(e => e.group))
      
      // Add empty placeholder events for encoders that have no blocks
      encoderNames.forEach(encoderName => {
        if (!existingGroups.has(encoderName)) {
          eventsList.push({
            id: `empty-${encoderName}`,
            title: '',
            group: encoderName,
            start_time: selectedDate ? moment.tz(selectedDate, 'America/New_York').startOf('day').toISOString() : new Date().toISOString(),
            end_time: selectedDate ? moment.tz(selectedDate, 'America/New_York').startOf('day').toISOString() : new Date().toISOString(),
            isEmpty: true // Flag to indicate this is an empty encoder row
          })
        }
      })
    }

    return eventsList
  }, [filteredBlocks, encoders, selectedDate])

  const loadBlocks = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBlocks()
      setBlocks(data)
    } catch (err) {
      setError(err.message)
      console.error('Error loading blocks:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDateChange = (date) => {
    setSelectedDate(date)
  }

  const handleBlockSelect = (event) => {
    // event.block contains the full block data
    setSelectedBlock(event.block)
  }

  const handleBlockUpdate = () => {
    // Reload blocks after update
    loadBlocks()
    setSelectedBlock(null)
  }

  // Calculate date picker height for sticky positioning
  useEffect(() => {
    const updateDatePickerHeight = () => {
      if (datePickerRef.current) {
        setDatePickerHeight(datePickerRef.current.offsetHeight)
      }
    }
    updateDatePickerHeight()
    const timeout1 = setTimeout(updateDatePickerHeight, 0)
    const timeout2 = setTimeout(updateDatePickerHeight, 100)
    window.addEventListener('resize', updateDatePickerHeight)
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      window.removeEventListener('resize', updateDatePickerHeight)
    }
  }, [availableDates, selectedDate])
  
  // Calculate navbar height for precise positioning
  const [navbarHeight, setNavbarHeight] = useState(73)
  useEffect(() => {
    const header = document.querySelector('header')
    if (header) {
      setNavbarHeight(header.offsetHeight)
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div ref={datePickerRef} className="p-4 border-b bg-gray-50 sticky z-40" style={{ top: `${navbarHeight}px` }}>
        {availableDates.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap mb-3">
            <DateNavigator 
              dates={availableDates}
              selectedDate={selectedDate}
              onDateChange={handleDateChange}
            />
            
            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Zoom:</span>
              <div className="flex gap-1">
                {[1, 3, 8, 24].map(hours => (
                  <button
                    key={hours}
                    onClick={() => {
                      setZoomHours(hours)
                      setScrollPosition(0) // Reset scroll when changing zoom
                    }}
                    className={`px-3 py-1 text-sm rounded ${
                      zoomHours === hours
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
              {zoomHours < 24 && (
                <>
                  <button
                    onClick={() => setScrollPosition(Math.max(0, scrollPosition - zoomHours))}
                    disabled={scrollPosition === 0}
                    className="px-2 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-gray-600">
                    {String(Math.floor(scrollPosition)).padStart(2, '0')}:00 - {String(Math.floor(scrollPosition + zoomHours) % 24).padStart(2, '0')}:00
                  </span>
                  <button
                    onClick={() => setScrollPosition(Math.min(24 - zoomHours, scrollPosition + zoomHours))}
                    disabled={scrollPosition >= 24 - zoomHours}
                    className="px-2 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Legend - Show for CBC timeline */}
        <div className="flex flex-wrap gap-2 items-center">
          {BLOCK_TYPES.map(type => {
            const bgColor = BLOCK_TYPE_COLORS[type] || DEFAULT_BLOCK_COLOR
            const borderColor = darkenColor(bgColor, 30)
            // Use dark text for light backgrounds, white text for dark backgrounds
            const lightColors = ['#ffffff', '#fef08a', '#bbf7d0', '#fed7aa', '#bfdbfe', 
                                '#fbcfe8', '#e5e7eb', '#9ca3af', '#fce7f3', '#e9d5ff', '#fde047']
            const textColor = lightColors.includes(bgColor) ? 'text-gray-900' : 'text-white'
            return (
              <div
                key={type}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border ${textColor}`}
                style={{
                  backgroundColor: bgColor,
                  borderColor: borderColor,
                  borderWidth: '2px'
                }}
              >
                <span className="text-xs font-medium">{type}</span>
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col min-h-0">
        {loading && blocks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading blocks...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500">Error: {error}</div>
          </div>
        ) : !selectedDate ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">No blocks available. Add blocks from OBS Timeline.</div>
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">No blocks for selected date.</div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className={selectedBlock ? "flex-1 min-w-0 min-h-0" : "flex-1 min-w-0 min-h-0"}>
              <ModernTimeline 
                events={events} 
                selectedDate={selectedDate}
                onItemSelect={handleBlockSelect}
                datePickerHeight={datePickerHeight}
                navbarHeight={navbarHeight}
                zoomHours={zoomHours}
                scrollPosition={scrollPosition}
              />
            </div>
            {selectedBlock && (
              <div className="w-96 flex-shrink-0 overflow-y-auto">
                <BlockEditor 
                  block={selectedBlock}
                  onClose={() => setSelectedBlock(null)}
                  onUpdate={handleBlockUpdate}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CBCTimelineView
