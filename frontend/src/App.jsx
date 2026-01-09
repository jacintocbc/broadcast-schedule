import { useState, useEffect } from 'react'
import ModernTimeline from './components/ModernTimeline'
import DateNavigator from './components/DateNavigator'
import EventDetailPanel from './components/EventDetailPanel'
import moment from 'moment'

function App() {
  const [events, setEvents] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch available dates on mount
  useEffect(() => {
    fetchAvailableDates()
  }, [])

  // Fetch events when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchEvents(selectedDate)
    } else if (availableDates.length > 0) {
      // Auto-select first available date
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

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold">Broadcast Resource Scheduler</h1>
      </header>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50 space-y-3">
          {availableDates.length > 0 && (
            <DateNavigator 
              dates={availableDates}
              selectedDate={selectedDate}
              onDateChange={handleDateChange}
            />
          )}
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col">
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
              <div className={selectedEvent ? "flex-1 min-w-0" : "flex-1 min-w-0"}>
                <ModernTimeline 
                  events={events} 
                  selectedDate={selectedDate}
                  onItemSelect={setSelectedEvent}
                />
              </div>
              {selectedEvent && (
                <div className="w-96 flex-shrink-0">
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
    </div>
  )
}

export default App
