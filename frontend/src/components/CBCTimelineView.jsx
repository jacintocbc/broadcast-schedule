import { useState, useEffect, useRef } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import BlockEditor from './BlockEditor'
import { getBlocks } from '../utils/api'
import moment from 'moment'

function CBCTimelineView() {
  const [blocks, setBlocks] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const datePickerRef = useRef(null)
  const [datePickerHeight, setDatePickerHeight] = useState(0)

  // Fetch blocks and extract available dates
  useEffect(() => {
    loadBlocks()
  }, [])

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

  // Transform blocks to events format for ModernTimeline
  const events = filteredBlocks.map(block => ({
    id: block.id,
    title: block.name,
    group: block.encoder?.name || 'No Encoder',
    start_time: block.start_time,
    end_time: block.end_time,
    block: block // Store full block data
  }))

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
      <div ref={datePickerRef} className="p-4 border-b bg-gray-50 space-y-3 sticky z-40" style={{ top: `${navbarHeight}px` }}>
        {availableDates.length > 0 && (
          <DateNavigator 
            dates={availableDates}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />
        )}
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
