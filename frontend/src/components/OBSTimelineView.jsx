import { useState, useEffect, useRef } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import EventDetailPanel from './EventDetailPanel'
import AddToCBCForm from './AddToCBCForm'

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

  const handleAddToCBC = async (event) => {
    try {
      // Create a block from the event
      await createBlock({
        name: event.title,
        obs_id: event.id,
        start_time: event.start_time,
        end_time: event.end_time,
        source_event_id: event.id
      })
      alert('Event added to CBC Timeline!')
    } catch (err) {
      alert('Error adding event to CBC: ' + err.message)
      console.error('Error adding to CBC:', err)
    }
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
              />
            </div>
            {eventToAdd && (
              <div className="w-96 flex-shrink-0 overflow-y-auto">
                <AddToCBCForm 
                  event={eventToAdd}
                  onClose={() => setEventToAdd(null)}
                  onSuccess={handleAddSuccess}
                />
              </div>
            )}
            {selectedEvent && !eventToAdd && (
              <div className="w-96 flex-shrink-0 overflow-y-auto">
                <EventDetailPanel 
                  event={selectedEvent}
                  onClose={() => setSelectedEvent(null)}
                  onAddToCBC={handleAddToCBC}
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
