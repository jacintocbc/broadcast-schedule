import { useState, useEffect, useRef } from 'react'
import ModernTimeline from './components/ModernTimeline'
import DateNavigator from './components/DateNavigator'
import EventDetailPanel from './components/EventDetailPanel'
import ResourceManager from './components/ResourceManager'
import BlockManager from './components/BlockManager'
import BoothPage from './components/BoothPage'
import moment from 'moment'

function App() {
  const [view, setView] = useState('timeline') // 'timeline', 'resources', 'blocks', 'booth'
  const [events, setEvents] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const datePickerRef = useRef(null)
  const [datePickerHeight, setDatePickerHeight] = useState(0)

  // Fetch available dates on mount
  useEffect(() => {
    if (view === 'timeline') {
      fetchAvailableDates()
    }
  }, [view])

  // Fetch events when date changes
  useEffect(() => {
    if (view === 'timeline' && selectedDate) {
      fetchEvents(selectedDate)
    } else if (view === 'timeline' && availableDates.length > 0) {
      // Auto-select first available date
      setSelectedDate(availableDates[0])
    }
  }, [selectedDate, availableDates, view])

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
  }, [availableDates, selectedDate, view])
  
  // Calculate navbar height for precise positioning
  const [navbarHeight, setNavbarHeight] = useState(73)
  useEffect(() => {
    const header = document.querySelector('header')
    if (header) {
      setNavbarHeight(header.offsetHeight)
    }
  }, [])

  const renderView = () => {
    switch (view) {
      case 'resources':
        return (
          <div className="p-6 space-y-6 overflow-y-auto">
            <ResourceManager resourceType="commentators" displayName="Commentators" />
            <ResourceManager resourceType="producers" displayName="Producers" />
            <ResourceManager resourceType="encoders" displayName="Encoders" />
            <ResourceManager resourceType="booths" displayName="Booths" />
            <ResourceManager resourceType="suites" displayName="Suites" />
            <ResourceManager resourceType="networks" displayName="Networks" />
          </div>
        )
      case 'blocks':
        return <BlockManager />
      case 'booth':
        return <BoothPage />
      case 'timeline':
      default:
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
                  <div className={selectedEvent ? "flex-1 min-w-0 min-h-0" : "flex-1 min-w-0 min-h-0"}>
                    <ModernTimeline 
                      events={events} 
                      selectedDate={selectedDate}
                      onItemSelect={setSelectedEvent}
                      datePickerHeight={datePickerHeight}
                      navbarHeight={navbarHeight}
                    />
                  </div>
                  {selectedEvent && (
                    <div className="w-96 flex-shrink-0 overflow-y-auto">
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
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-lg fixed top-0 left-0 right-0 z-50">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Broadcast Resource Scheduler</h1>
          <nav className="flex gap-4">
            <button
              onClick={() => setView('timeline')}
              className={`px-4 py-2 rounded ${view === 'timeline' ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setView('resources')}
              className={`px-4 py-2 rounded ${view === 'resources' ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            >
              Resources
            </button>
            <button
              onClick={() => setView('blocks')}
              className={`px-4 py-2 rounded ${view === 'blocks' ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            >
              Blocks
            </button>
            <button
              onClick={() => setView('booth')}
              className={`px-4 py-2 rounded ${view === 'booth' ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            >
              Booth Page
            </button>
          </nav>
        </div>
      </header>
      
      <div className="flex-1" style={{ paddingTop: `${navbarHeight}px` }}>
        {renderView()}
      </div>
    </div>
  )
}

export default App
