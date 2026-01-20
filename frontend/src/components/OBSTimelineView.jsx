import { useState, useEffect, useRef } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import EventDetailPanel from './EventDetailPanel'
import AddToCBCForm from './AddToCBCForm'
import moment from 'moment-timezone'

function OBSTimelineView() {
  const [events, setEvents] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventToAdd, setEventToAdd] = useState(null) // For double-click add form
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const datePickerRef = useRef(null)
  const [datePickerHeight, setDatePickerHeight] = useState(0)
  const [zoomHours, setZoomHours] = useState(24) // 1, 3, 8, or 24 hours
  const [scrollPosition, setScrollPosition] = useState(0) // Current scroll position in hours
  const [currentTime, setCurrentTime] = useState(() => moment.tz('America/New_York'))
  
  // Update current time every second for real-time clock display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(moment.tz('America/New_York'))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Format time for display (EST and ITA)
  const formatTime = () => {
    const et = currentTime.clone().tz('America/New_York')
    const ita = currentTime.clone().tz('Europe/Rome')
    
    return {
      et: et.format('HH:mm:ss'),
      ita: ita.format('HH:mm:ss')
    }
  }
  
  const times = formatTime()

  // Fetch available dates on mount
  useEffect(() => {
    fetchAvailableDates()
  }, [])

  // Fetch events when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchEvents(selectedDate)
    } else if (availableDates.length > 0) {
      setSelectedDate(availableDates[0])
    }
  }, [selectedDate, availableDates])

  const fetchAvailableDates = async () => {
    try {
      const response = await fetch('/api/events/dates')
      if (!response.ok) {
        throw new Error('Failed to fetch dates')
      }
      const data = await response.json()
      setAvailableDates(data)
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0])
      }
    } catch (err) {
      console.error('Error fetching dates:', err)
    }
  }

  const fetchEvents = async (date) => {
    try {
      setLoading(true)
      setError(null)
      const url = date ? `/api/events?date=${date}` : '/api/events'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch events')
      }
      const data = await response.json()
      setEvents(data)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching events:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDateChange = (date) => {
    setSelectedDate(date)
  }

  const handleDoubleClick = (event) => {
    // Open the add form sidebar
    setEventToAdd(event)
    setSelectedEvent(null) // Close event details if open
  }

  const handleAddSuccess = () => {
    // Optionally refresh or show success message
    setEventToAdd(null)
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
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
            
            {/* Dual Clock Display - Top Right */}
            <div className="flex items-center" style={{ gap: '25px' }}>
              <div className="text-3xl font-bold text-gray-800">
                {times.et} <span className="font-bold">EST</span>
              </div>
              <div className="text-3xl font-bold text-gray-800">
                {times.ita} ITA
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 flex flex-col min-h-0">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading events...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500">Error: {error}</div>
          </div>
        ) : !selectedDate ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">No events loaded. Please upload a CSV file.</div>
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">No events for selected date.</div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className={(selectedEvent || eventToAdd) ? "flex-1 min-w-0 min-h-0" : "flex-1 min-w-0 min-h-0"}>
              <ModernTimeline 
                events={events} 
                selectedDate={selectedDate}
                onItemSelect={setSelectedEvent}
                onItemDoubleClick={handleDoubleClick}
                datePickerHeight={datePickerHeight}
                navbarHeight={navbarHeight}
                zoomHours={zoomHours}
                scrollPosition={scrollPosition}
              />
            </div>
            {eventToAdd && (
              <div 
                className="w-96 flex-shrink-0 overflow-y-auto bg-white border-l border-gray-200"
                style={{
                  position: 'sticky',
                  top: `${navbarHeight + datePickerHeight}px`,
                  maxHeight: `calc(100vh - ${navbarHeight + datePickerHeight}px)`,
                  alignSelf: 'flex-start',
                  zIndex: 50,
                  backgroundColor: 'white'
                }}
              >
                <AddToCBCForm 
                  event={eventToAdd}
                  onClose={() => setEventToAdd(null)}
                  onSuccess={handleAddSuccess}
                />
              </div>
            )}
            {selectedEvent && !eventToAdd && (
              <div 
                className="w-96 flex-shrink-0 overflow-y-auto bg-white border-l border-gray-200"
                style={{
                  position: 'sticky',
                  top: `${navbarHeight + datePickerHeight}px`,
                  maxHeight: `calc(100vh - ${navbarHeight + datePickerHeight}px)`,
                  alignSelf: 'flex-start',
                  zIndex: 50,
                  backgroundColor: 'white'
                }}
              >
                <EventDetailPanel 
                  event={selectedEvent}
                  onClose={() => setSelectedEvent(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default OBSTimelineView
