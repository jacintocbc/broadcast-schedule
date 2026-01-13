import { useState, useEffect } from 'react'
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
          <div className="flex-1 overflow-hidden flex flex-col">
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
        )
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-lg">
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
      
      <div className="flex-1 overflow-hidden">
        {renderView()}
      </div>
    </div>
  )
}

export default App
