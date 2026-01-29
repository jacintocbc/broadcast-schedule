import { useState, useEffect, useRef, useMemo } from 'react'
import ModernTimeline from './ModernTimeline'
import DateNavigator from './DateNavigator'
import PlanningBlockPanel from './PlanningBlockPanel'
import { getBlocks, getResources, getPlanning, savePlanning } from '../utils/api'
import { BLOCK_TYPES, BLOCK_TYPE_COLORS, DEFAULT_BLOCK_COLOR, darkenColor, LEGEND_LIGHT_BACKGROUNDS } from '../utils/blockTypes'
import moment from 'moment-timezone'

function getBlockEffectiveTimes(block) {
  const hasBroadcast = block.broadcast_start_time && block.broadcast_end_time
  return {
    start: hasBroadcast ? block.broadcast_start_time : block.start_time,
    end: hasBroadcast ? block.broadcast_end_time : block.end_time
  }
}

function getPlanningBlockTimes(block, override) {
  if (override?.producer_broadcast_start_time && override?.producer_broadcast_end_time) {
    return { start: override.producer_broadcast_start_time, end: override.producer_broadcast_end_time }
  }
  return getBlockEffectiveTimes(block)
}

function PlanningTimelineView() {
  const [blocks, setBlocks] = useState([])
  const [encoders, setEncoders] = useState([])
  const [planning, setPlanning] = useState({ onAirBlockIds: [], overrides: {} })
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedOnAirBlock, setSelectedOnAirBlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const datePickerRef = useRef(null)
  const [datePickerHeight, setDatePickerHeight] = useState(0)
  const [zoomHours, setZoomHours] = useState(24)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [navbarHeight, setNavbarHeight] = useState(73)
  const hasInitializedDate = useRef(false)
  const previousDatesStr = useRef('')

  useEffect(() => {
    loadBlocks()
    loadEncoders()
    loadPlanning()
  }, [])

  const loadBlocks = async () => {
    try {
      setError(null)
      const data = await getBlocks()
      const list = Array.isArray(data) ? data : (data?.blocks ?? data?.data ?? [])
      setBlocks(list)
    } catch (err) {
      setError(err.message)
      console.error('Error loading blocks:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadEncoders = async () => {
    try {
      const data = await getResources('encoders')
      const sorted = (Array.isArray(data) ? data : []).sort((a, b) => {
        const aNum = parseInt((a.name || '').match(/\d+/)?.[0] || '999', 10)
        const bNum = parseInt((b.name || '').match(/\d+/)?.[0] || '999', 10)
        return aNum - bNum
      })
      setEncoders(sorted)
    } catch (err) {
      console.error('Error loading encoders:', err)
    }
  }

  const loadPlanning = async () => {
    try {
      const data = await getPlanning()
      setPlanning({
        onAirBlockIds: Array.isArray(data.onAirBlockIds) ? data.onAirBlockIds : [],
        overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {}
      })
    } catch (err) {
      console.error('Error loading planning:', err)
    }
  }

  const availableDatesMemo = useMemo(() => {
    const dateSet = new Set()
    blocks.forEach(block => {
      const { start, end } = getBlockEffectiveTimes(block)
      if (start) dateSet.add(moment(start).format('YYYY-MM-DD'))
      if (end) dateSet.add(moment(end).format('YYYY-MM-DD'))
    })
    return [...dateSet].sort().join(',')
  }, [blocks])

  useEffect(() => {
    const datesArray = availableDatesMemo.split(',').filter(Boolean)
    const currentDatesStr = availableDates.join(',')
    if (currentDatesStr !== availableDatesMemo) {
      setAvailableDates(datesArray)
    }
  }, [availableDatesMemo])

  useEffect(() => {
    const currentDatesStr = availableDates.join(',')
    if (currentDatesStr === previousDatesStr.current) return
    previousDatesStr.current = currentDatesStr
    if (availableDates.length > 0 && !hasInitializedDate.current) {
      hasInitializedDate.current = true
      const savedDate = localStorage.getItem('planningTimelineSelectedDate')
      if (savedDate && availableDates.includes(savedDate)) {
        setSelectedDate(savedDate)
      } else {
        const today = moment().format('YYYY-MM-DD')
        const next = availableDates.find(d => d >= today) || availableDates[availableDates.length - 1]
        setSelectedDate(next)
        localStorage.setItem('planningTimelineSelectedDate', next)
      }
    } else if (availableDates.length > 0 && selectedDate && !availableDates.includes(selectedDate)) {
      const next = availableDates.find(d => d >= selectedDate) || availableDates[availableDates.length - 1]
      setSelectedDate(next)
      localStorage.setItem('planningTimelineSelectedDate', next)
    } else if (availableDates.length === 0) {
      setSelectedDate(null)
      localStorage.removeItem('planningTimelineSelectedDate')
      hasInitializedDate.current = false
    }
  }, [availableDates])

  const filteredBlocks = useMemo(() => {
    if (!selectedDate) return []
    const selectedDateMoment = moment.tz(selectedDate, 'Europe/Rome')
    if (zoomHours === 48 || zoomHours === 36) {
      const timelineStart = selectedDateMoment.clone().hour(2).minute(0).second(0).millisecond(0)
      const timelineEnd = timelineStart.clone().add(zoomHours, 'hours')
      return blocks.filter(block => {
        const { start, end } = getBlockEffectiveTimes(block)
        if (!start || !end) return false
        const blockStart = moment.utc(start).tz('Europe/Rome')
        const blockEnd = moment.utc(end).tz('Europe/Rome')
        return blockStart.isBefore(timelineEnd) && blockEnd.isAfter(timelineStart)
      })
    }
    const selectedDayStart = selectedDateMoment.clone().startOf('day')
    const selectedDayEnd = selectedDateMoment.clone().endOf('day')
    return blocks.filter(block => {
      const { start, end } = getBlockEffectiveTimes(block)
      if (!start || !end) return false
      const blockStart = moment.utc(start).tz('Europe/Rome')
      const blockEnd = moment.utc(end).tz('Europe/Rome')
      return blockStart.isBefore(selectedDayEnd) && blockEnd.isAfter(selectedDayStart)
    })
  }, [blocks, selectedDate, zoomHours])

  const blocksHash = useMemo(() => {
    return blocks.map(b => `${b.id}-${JSON.stringify((b.booths || []).map(x => x.id))}`).join('|')
  }, [blocks])

  const events = useMemo(() => {
    const { onAirBlockIds, overrides } = planning
    const onAirEvents = []
    const blockById = new Map(blocks.map(b => [b.id, b]))
    onAirBlockIds.forEach(blockId => {
      const block = blockById.get(blockId)
      if (!block) return
      const override = overrides[blockId]
      const { start, end } = getPlanningBlockTimes(block, override)
      if (!start || !end) return
      const blockStart = moment.utc(start).tz('Europe/Rome')
      const blockEnd = moment.utc(end).tz('Europe/Rome')
      const selectedDateMoment = selectedDate ? moment.tz(selectedDate, 'Europe/Rome') : null
      if (selectedDateMoment) {
        if (zoomHours === 24) {
          const dayStart = selectedDateMoment.clone().startOf('day')
          const dayEnd = selectedDateMoment.clone().endOf('day')
          if (!blockStart.isBefore(dayEnd) || !blockEnd.isAfter(dayStart)) return
        } else {
          const timelineStart = selectedDateMoment.clone().hour(2).minute(0).second(0).millisecond(0)
          const timelineEnd = timelineStart.clone().add(zoomHours, 'hours')
          if (!blockStart.isBefore(timelineEnd) || !blockEnd.isAfter(timelineStart)) return
        }
      }
      onAirEvents.push({
        id: block.id,
        title: block.name,
        group: 'On Air',
        start_time: start,
        end_time: end,
        block: { ...block, booths: block.booths || [], networks: block.networks || [], commentators: block.commentators || [] }
      })
    })

    const blockEvents = filteredBlocks.map(block => {
      const { start, end } = getBlockEffectiveTimes(block)
      return {
        id: block.id,
        title: block.name,
        group: block.encoder?.name || 'No Encoder',
        start_time: start,
        end_time: end,
        block: { ...block, booths: block.booths || [], networks: block.networks || [], commentators: block.commentators || [] }
      }
    })
    // Always include On Air row (empty placeholder when no blocks) so it's visible as a drop target
    const eventsList = [...onAirEvents, ...blockEvents]
    if (onAirEvents.length === 0) {
      eventsList.unshift({
        id: 'empty-On Air',
        title: '',
        group: 'On Air',
        start_time: selectedDate ? moment.tz(selectedDate, 'Europe/Rome').startOf('day').toISOString() : new Date().toISOString(),
        end_time: selectedDate ? moment.tz(selectedDate, 'Europe/Rome').startOf('day').toISOString() : new Date().toISOString(),
        isEmpty: true
      })
    }
    if (encoders.length > 0) {
      const encoderNames = new Set(encoders.map(e => e.name))
      const existingGroups = new Set(blockEvents.map(e => e.group))
      encoderNames.forEach(encoderName => {
        if (!existingGroups.has(encoderName)) {
          eventsList.push({
            id: `empty-${encoderName}`,
            title: '',
            group: encoderName,
            start_time: selectedDate ? moment.tz(selectedDate, 'Europe/Rome').startOf('day').toISOString() : new Date().toISOString(),
            end_time: selectedDate ? moment.tz(selectedDate, 'Europe/Rome').startOf('day').toISOString() : new Date().toISOString(),
            isEmpty: true
          })
        }
      })
    }
    return eventsList
  }, [planning, filteredBlocks, encoders, selectedDate, blocks, blocksHash, zoomHours])

  const handleDateChange = (date) => {
    setSelectedDate(date)
    if (date) localStorage.setItem('planningTimelineSelectedDate', date)
    else localStorage.removeItem('planningTimelineSelectedDate')
  }

  const handleBlockSelect = (event) => {
    if (event.group === 'On Air' && event.block) {
      setSelectedOnAirBlock({
        block: event.block,
        override: planning.overrides[event.id] || {}
      })
    } else {
      setSelectedOnAirBlock(null)
    }
  }

  const handleAddToOnAir = async (blockId) => {
    const id = String(blockId)
    if (planning.onAirBlockIds.includes(id)) return
    const nextIds = [...planning.onAirBlockIds, id]
    try {
      const next = await savePlanning({ ...planning, onAirBlockIds: nextIds })
      setPlanning(next)
    } catch (err) {
      console.error('Failed to add block to On Air:', err)
    }
  }

  const handleSaveOverride = async (blockId, nextOverride) => {
    const nextOverrides = { ...planning.overrides, [blockId]: nextOverride }
    try {
      const next = await savePlanning({ ...planning, overrides: nextOverrides })
      setPlanning(next)
      setSelectedOnAirBlock(prev => prev && prev.block?.id === blockId ? { ...prev, override: nextOverrides[blockId] || {} } : prev)
    } catch (err) {
      throw err
    }
  }

  const handleRemoveFromOnAir = async (blockId) => {
    const nextIds = planning.onAirBlockIds.filter(id => id !== String(blockId))
    try {
      const next = await savePlanning({ ...planning, onAirBlockIds: nextIds })
      setPlanning(next)
      setSelectedOnAirBlock(null)
    } catch (err) {
      console.error('Failed to remove from On Air:', err)
    }
  }

  useEffect(() => {
    const update = () => {
      if (datePickerRef.current) setDatePickerHeight(datePickerRef.current.offsetHeight)
    }
    update()
    const t1 = setTimeout(update, 0)
    const t2 = setTimeout(update, 100)
    window.addEventListener('resize', update)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', update)
    }
  }, [availableDates, selectedDate])

  useEffect(() => {
    const header = document.querySelector('header')
    if (header) setNavbarHeight(header.offsetHeight)
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div ref={datePickerRef} className="p-4 border-b bg-gray-50 sticky z-40" style={{ top: `${navbarHeight}px` }}>
        {availableDates.length > 0 && (
          <div className="flex justify-between gap-4 flex-wrap mb-3">
            <div className="flex gap-4 flex-wrap">
              <DateNavigator
                dates={availableDates}
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
              />
              <div className="flex gap-2">
                <span className="text-sm font-medium text-gray-700">Zoom:</span>
                {[24, 36, 48].map(hours => (
                  <button
                    key={hours}
                    onClick={() => { setZoomHours(hours); setScrollPosition(0) }}
                    className={`px-3 py-1 text-sm rounded ${zoomHours === hours ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {loading && blocks.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-500">Loading…</div>
        ) : error ? (
          <div className="flex justify-center items-center h-full text-red-500">Error: {error}</div>
        ) : !selectedDate ? (
          <div className="flex justify-center items-center h-full text-gray-500">No dates available. Add blocks from OBS Timeline.</div>
        ) : events.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-500">No blocks for selected date.</div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 min-h-0">
              <ModernTimeline
                events={events}
                selectedDate={selectedDate}
                onItemSelect={handleBlockSelect}
                datePickerHeight={datePickerHeight}
                navbarHeight={navbarHeight}
                zoomHours={zoomHours}
                scrollPosition={scrollPosition}
                onBlockDropOnGroup={handleAddToOnAir}
              />
            </div>
            {selectedOnAirBlock && (
              <div
                className="w-96 flex-shrink-0 overflow-y-auto bg-white border-l border-gray-200"
                style={{
                  position: 'sticky',
                  top: `${navbarHeight + datePickerHeight}px`,
                  maxHeight: `calc(100vh - ${navbarHeight + datePickerHeight}px)`,
                  alignSelf: 'flex-start',
                  zIndex: 50
                }}
              >
                <PlanningBlockPanel
                  block={selectedOnAirBlock.block}
                  override={selectedOnAirBlock.override}
                  onClose={() => setSelectedOnAirBlock(null)}
                  onSave={handleSaveOverride}
                  onRemoveFromOnAir={handleRemoveFromOnAir}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlanningTimelineView
