import { useState, useEffect, useRef } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import EventDetailPanel from './EventDetailPanel'
import AddToCBCForm from './AddToCBCForm'
import moment from 'moment-timezone'
import { getBlocks } from '../utils/api'
import { BLOCK_TYPES, BLOCK_TYPE_COLORS, DEFAULT_BLOCK_COLOR, darkenColor, LEGEND_LIGHT_BACKGROUNDS } from '../utils/blockTypes'

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
  const [zoomHours, setZoomHours] = useState(24) // 24, 36, or 48 hours
  const [scrollPosition, setScrollPosition] = useState(0) // Current scroll position in hours
  const [currentTime, setCurrentTime] = useState(() => moment.tz('America/New_York'))
  
  // Update current time every second for real-time clock display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(moment.tz('America/New_York'))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
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

  // Fetch available dates on mount
  useEffect(() => {
    fetchAvailableDates()
  }, [])

  // When available dates are loaded, restore saved date or use today/closest next
  useEffect(() => {
    if (availableDates.length > 0) {
      // Helper function to find today's date or closest next available date
      const findDefaultDate = () => {
        const today = moment().format('YYYY-MM-DD')
        
        // If today is available, use it
        if (availableDates.includes(today)) {
          return today
        }
        
        // Otherwise, find the first date that's today or in the future
        const todayMoment = moment(today)
        const nextDate = availableDates.find(date => moment(date).isSameOrAfter(todayMoment))
        
        // If no future date found, use the last available date (most recent)
        return nextDate || availableDates[availableDates.length - 1]
      }
      
      if (!selectedDate) {
        // Try to load from localStorage first
        const savedDate = localStorage.getItem('obsTimelineSelectedDate')
        if (savedDate && availableDates.includes(savedDate)) {
          setSelectedDate(savedDate)
        } else {
          // Use today or closest next available date
          const defaultDate = findDefaultDate()
          setSelectedDate(defaultDate)
          localStorage.setItem('obsTimelineSelectedDate', defaultDate)
        }
      } else if (selectedDate && !availableDates.includes(selectedDate)) {
        // If selected date is no longer available, switch to today or closest next
        const defaultDate = findDefaultDate()
        setSelectedDate(defaultDate)
        localStorage.setItem('obsTimelineSelectedDate', defaultDate)
      }
    }
  }, [availableDates]) // Only depend on availableDates, not selectedDate

  // Save to localStorage when date changes
  useEffect(() => {
    if (selectedDate) {
      localStorage.setItem('obsTimelineSelectedDate', selectedDate)
    }
  }, [selectedDate])

  const fetchAvailableDates = async () => {
    try {
      const response = await fetch('/api/events/dates')
      if (!response.ok) {
        throw new Error('Failed to fetch dates')
      }
      const data = await response.json()
      setAvailableDates(data)
      // Don't set selectedDate here - let the useEffect handle it with localStorage
    } catch (err) {
      console.error('Error fetching dates:', err)
    }
  }

  // Store all events, filter based on selected date and zoom
  const [allEvents, setAllEvents] = useState([])
  // OBS event IDs that are already scheduled on the CBC timeline (blocks with obs_id)
  const [scheduledOnCBCEventIds, setScheduledOnCBCEventIds] = useState(new Set())
  
  const fetchScheduledObsIds = async () => {
    try {
      const blocks = await getBlocks()
      const ids = new Set((blocks || []).filter(b => b.obs_id).map(b => String(b.obs_id)))
      setScheduledOnCBCEventIds(ids)
    } catch (err) {
      console.error('Error fetching blocks for scheduled OBS ids:', err)
    }
  }
  
  // Fetch blocks on mount to know which OBS events are already on CBC timeline
  useEffect(() => {
    fetchScheduledObsIds()
  }, [])
  
  // Fetch all events once on mount
  useEffect(() => {
    const fetchAllEvents = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/events')
        if (!response.ok) {
          throw new Error('Failed to fetch events')
        }
        const data = await response.json()
        // Diagnostic: ensure we got an array (API returns array directly)
        const eventList = Array.isArray(data) ? data : (data?.events ?? [])
        setAllEvents(eventList)
      } catch (err) {
        setError(err.message)
        console.error('Error fetching all events:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAllEvents()
  }, [])
  
  // Filter events based on selected date and zoom
  useEffect(() => {
    if (!selectedDate) {
      setEvents([])
      return
    }
    
    if (allEvents.length === 0) {
      return
    }
    
    const selectedDateMoment = moment.tz(selectedDate, 'Europe/Rome')
    
    // For 36h/48h zoom, filter by multi-hour timeline window (02:00 selected day + zoomHours)
    if (zoomHours === 48 || zoomHours === 36) {
      const timelineStart = selectedDateMoment.clone().hour(2).minute(0).second(0).millisecond(0)
      const timelineEnd = timelineStart.clone().add(zoomHours, 'hours')
      const viewNextDateStr = selectedDateMoment.clone().add(1, 'day').format('YYYY-MM-DD')
      
      const failedReasons = { noStart: 0, noEnd: 0, noOverlap: 0, bcExcluded: 0 }
      let firstExcludedSample = null
      const filtered = allEvents.filter(event => {
        if (!event.start_time) {
          failedReasons.noStart++
          if (!firstExcludedSample) firstExcludedSample = { reason: 'noStart', id: event.id, start_time: event.start_time, end_time: event.end_time }
          return false
        }
        const eventStart = moment.utc(event.start_time).tz('Europe/Rome')
        const title = (event.title || '').trim().toUpperCase()
        const isBCByTitle = title.startsWith('BC')
        const hasNoEnd = !event.end_time
        const endSameAsStart = event.end_time && moment.utc(event.end_time).tz('Europe/Rome').isSame(eventStart)
        const isZeroDuration = hasNoEnd || endSameAsStart
        // Only 0-duration BC items get beauty-camera treatment. BC with times → normal overlap below.
        const isBeautyCamera = isBCByTitle && isZeroDuration
        if (isBeautyCamera) {
          // When event.date exists (e.g. "05/02/2026" DD/MM/YYYY), use it as the canonical day for "in view"
          const canonicalFromDate = event.date && (() => {
            const m = moment(event.date, ['DD/MM/YYYY', 'YYYY-MM-DD'], true)
            return m.isValid() ? m.format('YYYY-MM-DD') : null
          })()
          const eventStartDateStr = eventStart.format('YYYY-MM-DD')
          const displayDateStr = eventStart.clone().add(1, 'day').format('YYYY-MM-DD')
          const inView = canonicalFromDate
            ? (canonicalFromDate === selectedDate || canonicalFromDate === viewNextDateStr)
            : (displayDateStr === selectedDate || displayDateStr === viewNextDateStr ||
               eventStartDateStr === selectedDate || eventStartDateStr === viewNextDateStr)
          if (!inView) failedReasons.bcExcluded++
          return inView
        }
        if (!event.end_time) {
          failedReasons.noEnd++
          if (!firstExcludedSample) firstExcludedSample = { reason: 'noEnd', id: event.id, start_time: event.start_time, end_time: event.end_time }
          return false
        }
        const eventEnd = moment.utc(event.end_time).tz('Europe/Rome')
        const overlaps = eventStart.isBefore(timelineEnd) && eventEnd.isAfter(timelineStart)
        if (!overlaps) {
          failedReasons.noOverlap++
          if (!firstExcludedSample) firstExcludedSample = { reason: 'noOverlap', id: event.id, eventStart: eventStart.format('YYYY-MM-DD HH:mm'), eventEnd: eventEnd.format('YYYY-MM-DD HH:mm'), timelineStart: timelineStart.format('YYYY-MM-DD HH:mm'), timelineEnd: timelineEnd.format('YYYY-MM-DD HH:mm') }
        }
        return overlaps
      })
      setEvents(filtered)
    } else {
      // For 24h, filter by selected day. Beauty cameras: display date = Milan start + 1 day; include when that matches selectedDate.
      const dayStart = selectedDateMoment.clone().startOf('day')
      const dayEnd = selectedDateMoment.clone().endOf('day')
      
      const filtered = allEvents.filter(event => {
        if (!event.start_time) return false
        const eventStart = moment.utc(event.start_time).tz('Europe/Rome')
        const title = (event.title || '').trim().toUpperCase()
        const isBCByTitle = title.startsWith('BC')
        const hasNoEnd = !event.end_time
        const endSameAsStart = event.end_time && moment.utc(event.end_time).tz('Europe/Rome').isSame(eventStart)
        const isZeroDuration = hasNoEnd || endSameAsStart
        // Only 0-duration BC items get beauty-camera treatment. BC with times → normal overlap below.
        const isBeautyCamera = isBCByTitle && isZeroDuration
        if (isBeautyCamera) {
          const sel = selectedDate ? moment(selectedDate).format('YYYY-MM-DD') : ''
          // When event.date exists (e.g. "05/02/2026" DD/MM/YYYY), it is the canonical day — use it even if start/end times are another date
          const canonicalFromDate = event.date && (() => {
            const m = moment(event.date, ['DD/MM/YYYY', 'YYYY-MM-DD'], true)
            return m.isValid() ? m.format('YYYY-MM-DD') : null
          })()
          if (canonicalFromDate) {
            return canonicalFromDate === sel
          }
          // Else use Milan start/display: only when selectedDate is start day or next day, and start not more than 1 day before
          const eventStartDateStr = eventStart.format('YYYY-MM-DD')
          const displayDateStr = eventStart.clone().add(1, 'day').format('YYYY-MM-DD')
          const minStart = sel ? moment(sel).subtract(1, 'day').format('YYYY-MM-DD') : ''
          const belongsToSelectedDay = displayDateStr === sel || eventStartDateStr === sel
          const notTooOld = !minStart || eventStartDateStr >= minStart
          return belongsToSelectedDay && notTooOld
        }
        if (!event.end_time) return false
        const eventEnd = moment.utc(event.end_time).tz('Europe/Rome')
        return eventStart.isBefore(dayEnd) && eventEnd.isAfter(dayStart)
      })
      setEvents(filtered)
    }
  }, [selectedDate, zoomHours, allEvents])
  
  const fetchEvents = async (date) => {
    // This function is no longer needed but kept for compatibility
    // Events are now filtered in the useEffect above
  }

  const handleDateChange = (date) => {
    setSelectedDate(date)
    // Save to localStorage when user manually changes date
    if (date) {
      localStorage.setItem('obsTimelineSelectedDate', date)
    } else {
      localStorage.removeItem('obsTimelineSelectedDate')
    }
  }

  const handleDoubleClick = (event) => {
    // Open the add form sidebar
    setEventToAdd(event)
    setSelectedEvent(null) // Close event details if open
  }

  const handleAddSuccess = () => {
    setEventToAdd(null)
    fetchScheduledObsIds() // Refresh so the new block shows as "scheduled" on OBS timeline
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div ref={datePickerRef} className="flex-shrink-0 p-4 border-b bg-gray-50 z-40">
        {availableDates.length > 0 && (
          <>
            <div className="flex items-center gap-4 flex-wrap mb-3">
              <DateNavigator 
                dates={availableDates}
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Zoom:</span>
                <div className="flex gap-1">
                  {[24, 36, 48].map(hours => (
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
            {/* Legend + Clock on same row: legend left, clock right */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-2 items-center">
                {BLOCK_TYPES.map(type => {
                  const bgColor = BLOCK_TYPE_COLORS[type] || DEFAULT_BLOCK_COLOR
                  const borderColor = darkenColor(bgColor, 30)
                  const textColor = LEGEND_LIGHT_BACKGROUNDS.includes(bgColor) ? 'text-gray-900' : 'text-white'
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
              <div className="flex items-center">
                <div className="text-3xl font-bold text-gray-800 font-mono">
                  {times.cet} CET
                </div>
                <span className="text-3xl font-bold text-gray-800 mx-4" style={{ transform: 'translateY(-2px)' }}>/</span>
                <div className="text-3xl font-bold text-gray-800 font-mono">
                  {times.et} <span className="font-bold">ET</span>
                </div>
              </div>
            </div>
          </>
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
                scheduledOnCBCEventIds={scheduledOnCBCEventIds}
              />
            </div>
            {eventToAdd && (
              <div className="w-96 flex-shrink-0 overflow-y-auto bg-white border-l border-gray-200 flex flex-col min-h-0">
                <AddToCBCForm 
                  event={eventToAdd}
                  onClose={() => setEventToAdd(null)}
                  onSuccess={handleAddSuccess}
                />
              </div>
            )}
            {selectedEvent && !eventToAdd && (
              <div className="w-96 flex-shrink-0 overflow-y-auto bg-white border-l border-gray-200 flex flex-col min-h-0">
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
