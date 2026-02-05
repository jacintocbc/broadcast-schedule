import { useMemo, useRef, useEffect, useState } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { getBlockTypeColor, darkenColor, inferOBSEventDisplayType, LEGEND_LIGHT_BACKGROUNDS } from '../utils/blockTypes'

function ModernTimeline({ events, selectedDate, onItemSelect, onItemDoubleClick, datePickerHeight = 0, navbarHeight = 73, zoomHours = 24, scrollPosition = 0, scheduledOnCBCEventIds, onNewBlockRange, onBlockDropOnGroup, editingBlockDraft, onOnAirResize }) {
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const scrollableRef = useRef(null)
  const timelineHeaderTimeRef = useRef(null) // Header time area - matches hour markers, avoids scrollbar narrowing rows
  const dragRectRef = useRef(null) // Captured at mousedown, used for entire drag (same coord system for start & end)
  const [availableHeight, setAvailableHeight] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => moment.tz('America/New_York'))
  // Drag-to-create new block (CBC timeline): { startPercent, endPercent, group } while dragging
  const [newBlockDrag, setNewBlockDrag] = useState(null)
  // Resize On Air block: { blockId, edge: 'left'|'right', startPercent, endPercent, group, rect }
  const [resizeDrag, setResizeDrag] = useState(null)
  const resizeDragRef = useRef(null)
  resizeDragRef.current = resizeDrag
  // Move On Air block: { blockId, startPercent, endPercent, group, rect, initialMouseX, initialStartPercent, initialEndPercent }
  const [moveDrag, setMoveDrag] = useState(null)
  const moveDragRef = useRef(null)
  moveDragRef.current = moveDrag
  
  // Calculate selectedDayStart - explicitly parse as midnight Milan to avoid local-timezone interpretation
  const selectedDayStart = useMemo(() => {
    return selectedDate 
      ? moment.tz(selectedDate + ' 00:00', 'YYYY-MM-DD HH:mm', 'Europe/Rome')
      : moment.tz('Europe/Rome').startOf('day')
  }, [selectedDate])
  
  // Update current time every minute - use Milan timezone
  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTime(moment.tz('Europe/Rome'))
    }
    
    // Update immediately
    updateCurrentTime()
    
    // Update every minute
    const interval = setInterval(updateCurrentTime, 60000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Calculate current time line position
  const currentTimePosition = useMemo(() => {
    // Timeline spans from 02:00 (2 AM) for zoomHours duration
    const timelineStartHour = 2
    const timelineStartMinutes = timelineStartHour * 60 // 02:00 = 120 minutes from day start
    const effectiveZoomHours = zoomHours >= 24 ? zoomHours : 24 // Use zoomHours if >= 24, otherwise default to 24
    const timelineEndMinutes = (effectiveZoomHours + 2) * 60 // End time = start + zoomHours
    const visibleRangeMinutes = timelineEndMinutes - timelineStartMinutes // Total visible range in minutes
    
    // Calculate current time position in minutes from selected day start
    const currentMinutesFromDayStart = currentTime.diff(selectedDayStart, 'minutes')
    
    // Check if current time is within timeline range (02:00 to 02:00 + zoomHours)
    // For multi-day views, we need to check if current time is within the visible range
    const isInRange = currentMinutesFromDayStart >= timelineStartMinutes && 
                      currentMinutesFromDayStart <= timelineEndMinutes
    
    if (!isInRange) {
      return null // Don't show line if current time is outside timeline range
    }
    
    // Calculate position relative to timeline start (02:00)
    const currentMinutesFromTimelineStart = currentMinutesFromDayStart - timelineStartMinutes
    
    // Calculate position as percentage
    const positionPercent = (currentMinutesFromTimelineStart / visibleRangeMinutes) * 100
    
    return positionPercent
  }, [currentTime, selectedDayStart, zoomHours])

  const { hours, groups, itemsByGroup } = useMemo(() => {
    if (!events || events.length === 0) {
      return { hours: [], groups: [], itemsByGroup: {} }
    }

    // Generate hours: start at 02:00 (2 AM) and span zoomHours
    // For 24h: 02:00 to 02:00 next day (24 hour markers)
    // For 36h: 02:00 day 1 to 14:00 day 2 (36 hour markers)
    // For 48h: 02:00 day 1 to 02:00 day 3 (48 hour markers)
    const startHour = 2 // Start at 2 AM
    const totalHours = zoomHours >= 24 ? zoomHours : 24 // Use zoomHours if >= 24, otherwise default to 24
    const hours = Array.from({ length: totalHours }, (_, i) => {
      const hour = selectedDayStart.clone().add(startHour + i, 'hours')
      // If hour goes past midnight, it will automatically roll to next day
      return hour
    })

    // Get unique groups (channels)
    const uniqueGroups = [...new Set(events.map(e => e.group).filter(Boolean))]
    
    // Custom sort: On Air first (planning), then DX01, then DX02-DX99, TX 01-27, then others
    const groups = uniqueGroups.sort((a, b) => {
      if (a === 'On Air') return -1
      if (b === 'On Air') return 1
      // Check if both are DX groups
      const aIsDX = /^DX\d+$/i.test(a)
      const bIsDX = /^DX\d+$/i.test(b)
      
      // Check if both are TX groups
      const aIsTX = /^TX\s*\d+$/i.test(a)
      const bIsTX = /^TX\s*\d+$/i.test(b)
      
      // DX01 always first
      if (a.toUpperCase() === 'DX01') return -1
      if (b.toUpperCase() === 'DX01') return 1
      
      // Both are DX groups - sort numerically
      if (aIsDX && bIsDX) {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '999', 10)
        const bNum = parseInt(b.match(/\d+/)?.[0] || '999', 10)
        return aNum - bNum
      }
      
      // Only one is DX - DX groups come before others
      if (aIsDX) return -1
      if (bIsDX) return 1
      
      // Both are TX groups - sort numerically
      if (aIsTX && bIsTX) {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '999', 10)
        const bNum = parseInt(b.match(/\d+/)?.[0] || '999', 10)
        return aNum - bNum
      }
      
      // Only one is TX - TX groups come after DX but before others
      if (aIsTX) return -1
      if (bIsTX) return 1
      
      // Neither is DX or TX - sort alphabetically
      return a.localeCompare(b)
    })

    // Group events by channel
    const itemsByGroup = {}
    
    groups.forEach(group => {
      itemsByGroup[group] = events
        .filter(e => e.group === group)
        .map((event, index) => {
          // Parse times - backend stores ISO strings in UTC (e.g., "2026-02-01T11:00:00.000Z")
          // Explicitly parse as UTC to ensure correct conversion
          const startUTC = moment.utc(event.start_time)
          // OBS beauty cameras often have same or missing end_time; treat missing as same as start for 0-duration detection
          const endUTC = event.end_time ? moment.utc(event.end_time) : startUTC.clone()
          
          // Convert to Milan time for positioning on timeline (primary timezone)
          const start = startUTC.tz('Europe/Rome')
          const end = endUTC.tz('Europe/Rome')
          
          // Also get EST time for secondary display
          const startEST = startUTC.tz('America/New_York')
          const endEST = endUTC.tz('America/New_York')
          
          // Use the actual start and end times directly (not clamped to day boundaries)
          // Calculate position within the selected day (in Milan time)
          const startHour = start.hour()
          const startMinute = start.minute()
          const endHour = end.hour()
          const endMinute = end.minute()
          
          // Calculate position relative to the selected day start (in minutes)
          const startMinutesFromDayStart = start.diff(selectedDayStart, 'minutes')
          const endMinutesFromDayStart = end.diff(selectedDayStart, 'minutes')
          
          // Convert to percentage of visible time range
          // Timeline spans from 02:00 (2 AM) for zoomHours duration
          const timelineStartHour = 2
          const timelineStartMinutes = timelineStartHour * 60 // 02:00 = 120 minutes from day start
          const effectiveZoomHours = zoomHours >= 24 ? zoomHours : 24 // Use zoomHours if >= 24, otherwise default to 24
          const timelineEndMinutes = (effectiveZoomHours + 2) * 60 // End time = start + zoomHours
          const visibleRangeMinutes = timelineEndMinutes - timelineStartMinutes // Total visible range in minutes
          
          // Calculate position relative to timeline start (02:00)
          // Handle events that span midnight
          let startMinutesFromTimelineStart, endMinutesFromTimelineStart
          if (startMinutesFromDayStart >= timelineStartMinutes) {
            // Event starts on the same day (after 02:00)
            startMinutesFromTimelineStart = startMinutesFromDayStart - timelineStartMinutes
          } else {
            // Event starts before 02:00, treat as starting at timeline start
            startMinutesFromTimelineStart = 0
          }
          
          if (endMinutesFromDayStart <= timelineEndMinutes) {
            // Event ends before or at 01:00 next day
            if (endMinutesFromDayStart >= timelineStartMinutes) {
              endMinutesFromTimelineStart = endMinutesFromDayStart - timelineStartMinutes
            } else {
              // Event ends before 02:00, treat as ending at timeline start
              endMinutesFromTimelineStart = 0
            }
          } else {
            // Event ends after 01:00 next day, clamp to timeline end
            endMinutesFromTimelineStart = visibleRangeMinutes
          }
          
          // Handle events that wrap around midnight
          if (endMinutesFromDayStart < startMinutesFromDayStart) {
            // Event spans midnight
            if (startMinutesFromDayStart >= timelineStartMinutes) {
              // Starts after 02:00, ends next day
              endMinutesFromTimelineStart = visibleRangeMinutes
            } else if (endMinutesFromDayStart <= 60) {
              // Starts before 02:00, ends before 01:00 next day
              startMinutesFromTimelineStart = 0
              endMinutesFromTimelineStart = endMinutesFromDayStart + (24 * 60 - timelineStartMinutes)
            }
          }
          
          // Calculate duration and width
          const durationMinutes = end.diff(start, 'minutes')
          const isZeroDuration = durationMinutes === 0
          const isOBSEvent = !event.block
          const title = (event.title || '').trim().toUpperCase()
          const isBCByTitle = title.startsWith('BC')
          // Only 0-duration BC items are beauty cameras. BC items with times → normal (blue) events.
          const isBeautyCamera = isBCByTitle && isZeroDuration && isOBSEvent
          
          // Beauty cameras (0-duration BC, OBS): display date = Milan start + 1 day → show as 24hr block 02:00 that date until 02:00 next day.
          const BEAUTY_CAMERA_HOURS = 24
          let startPercent, widthPercent
          let displayStartMilan = start
          let displayEndMilan = end
          if (isBeautyCamera) {
            const selectedDateStr = selectedDate || selectedDayStart.format('YYYY-MM-DD')
            const viewNextDateStr = moment.tz(selectedDateStr, 'Europe/Rome').add(1, 'day').format('YYYY-MM-DD')
            const eventStartDateStr = start.format('YYYY-MM-DD')
            const displayDateStr = start.clone().add(1, 'day').format('YYYY-MM-DD')
            const daySplitPct = zoomHours === 48 ? 50 : zoomHours === 36 ? (100 * 24 / 36) : null
            // When event.date exists (e.g. "05/02/2026" DD/MM/YYYY), use it as the canonical day — accommodates Date=Feb 5 vs start/end=Feb 4
            const canonicalFromDate = event.date && (() => {
              const m = moment(event.date, ['DD/MM/YYYY', 'YYYY-MM-DD'], true)
              return m.isValid() ? m.format('YYYY-MM-DD') : null
            })()
            // Which date we show this BC for: prefer event.date when present; in 24h use selectedDate; in 36h/48h use date in view
            let eventDateStr
            if (daySplitPct == null) {
              // 24h: block is always 02:00 selectedDate → 02:00 selectedDate+1 (filter already ensured this BC belongs to selectedDate)
              eventDateStr = selectedDateStr
            } else if (canonicalFromDate && (canonicalFromDate === selectedDateStr || canonicalFromDate === viewNextDateStr)) {
              eventDateStr = canonicalFromDate
            } else {
              // 36h/48h: use the date that's in the visible range so BCs appear on the correct day/segment
              if (eventStartDateStr === selectedDateStr || eventStartDateStr === viewNextDateStr) {
                eventDateStr = eventStartDateStr
              } else {
                eventDateStr = displayDateStr
              }
            }
            const eventDateNextStr = moment.tz(eventDateStr, 'Europe/Rome').add(1, 'day').format('YYYY-MM-DD')
            // 24hr block: 02:00 eventDateStr → 02:00 eventDateNextStr
            displayStartMilan = moment.tz(eventDateStr + ' 02:00', 'Europe/Rome')
            displayEndMilan = moment.tz(eventDateNextStr + ' 02:00', 'Europe/Rome')
            if (daySplitPct != null) {
              // 36h/48h: place in the segment for that date; width = full 24h segment for that day
              if (eventDateStr === selectedDateStr) {
                startPercent = 0
                widthPercent = daySplitPct // full first day segment (24h)
              } else if (eventDateStr === viewNextDateStr) {
                startPercent = daySplitPct
                widthPercent = 100 - daySplitPct // full second day segment
              } else {
                startPercent = 0
                widthPercent = daySplitPct ?? 100
              }
            } else {
              // 24h: full-day block (02:00–02:00 next day = 100% of timeline)
              startPercent = 0
              widthPercent = 100
            }
          } else {
            // Calculate position relative to timeline start (20:00)
            // Clamp to timeline range (0-100%)
            startPercent = Math.max(0, Math.min(100, (startMinutesFromTimelineStart / visibleRangeMinutes) * 100))
            
            // For 0-duration blocks, use minimum width
            let effectiveDurationMinutes = durationMinutes
            if (isZeroDuration) {
              effectiveDurationMinutes = Math.max(5, visibleRangeMinutes / 20)
            }
            const endPercent = Math.max(0, Math.min(100, (endMinutesFromTimelineStart / visibleRangeMinutes) * 100))
            widthPercent = Math.max(0.5, endPercent - startPercent) // Minimum 0.5% width
          }
          
          // Store Milan times for display (primary) and EST (secondary). Beauty cameras show 02:00–02:00 that day.
          const outStartMilan = isBeautyCamera ? displayStartMilan : start
          const outEndMilan = isBeautyCamera ? displayEndMilan : end
          return {
            ...event,
            startPercent,
            widthPercent,
            startHour: outStartMilan.hour(),
            startMinute: outStartMilan.minute(),
            endHour: outEndMilan.hour(),
            endMinute: outEndMilan.minute(),
            durationMinutes,
            isZeroDuration: durationMinutes === 0,
            isBeautyCamera: !!isBeautyCamera,
            startMilan: outStartMilan,
            endMilan: outEndMilan,
            startEST: outStartMilan.clone().tz('America/New_York'),
            endEST: outEndMilan.clone().tz('America/New_York'),
            startMinutesFromDayStart,
            endMinutesFromDayStart
          }
        })
        .sort((a, b) => a.startPercent - b.startPercent)
    })

    return { hours, groups, itemsByGroup }
  }, [events, selectedDate, zoomHours, scrollPosition, selectedDayStart])

  // Calculate available height for scrollable area
  useEffect(() => {
    const calculateHeight = () => {
      if (containerRef.current && headerRef.current) {
        const containerHeight = containerRef.current.clientHeight || containerRef.current.offsetHeight
        const headerHeight = headerRef.current.offsetHeight || headerRef.current.clientHeight
        if (containerHeight > 0 && headerHeight > 0) {
          const calculatedHeight = containerHeight - headerHeight
          if (calculatedHeight > 0) {
            setAvailableHeight(calculatedHeight)
          }
        }
      }
    }

    // Calculate immediately and after delays to catch all render cycles
    calculateHeight()
    const timeout1 = setTimeout(calculateHeight, 0)
    const timeout2 = setTimeout(calculateHeight, 50)
    const timeout3 = setTimeout(calculateHeight, 200)
    const timeout4 = setTimeout(calculateHeight, 500)
    
    window.addEventListener('resize', calculateHeight)
    
    // Use ResizeObserver for more accurate tracking
    let resizeObserver = null
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(calculateHeight)
      resizeObserver.observe(containerRef.current)
      if (headerRef.current) {
        resizeObserver.observe(headerRef.current)
      }
    }
    
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      clearTimeout(timeout3)
      clearTimeout(timeout4)
      window.removeEventListener('resize', calculateHeight)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [groups.length, events.length, selectedDate])

  // Track click timing to distinguish single vs double click
  const clickTimeoutRef = useRef(null)
  const lastClickRef = useRef({ event: null, time: 0 })
  const dragLayerRef = useRef(null)
  const newBlockDragRef = useRef(null)
  newBlockDragRef.current = newBlockDrag

  // Convert timeline percent (0–100) to Milan time
  const percentToMilanTime = (percent) => {
    const timelineStartMinutes = 2 * 60 // 02:00
    const visibleRangeMinutes = (zoomHours >= 24 ? zoomHours : 24) * 60
    const minutesFromDayStart = timelineStartMinutes + (percent / 100) * visibleRangeMinutes
    return selectedDayStart.clone().add(minutesFromDayStart, 'minutes')
  }

  const handleNewBlockDragStart = (e, group) => {
    if (!onNewBlockRange || e.button !== 0) return
    e.preventDefault()
    // Capture rect at mousedown and use for entire drag - same coordinate system for start and end
    const rect = e.currentTarget.getBoundingClientRect()
    dragRectRef.current = rect
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    dragLayerRef.current = e.currentTarget
    const drag = { startPercent: percent, endPercent: percent, group }
    setNewBlockDrag(drag)
    newBlockDragRef.current = drag
  }

  useEffect(() => {
    if (!newBlockDrag) return
    const handleMove = (e) => {
      if (!dragLayerRef.current || !dragRectRef.current) return
      const rect = dragRectRef.current
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      setNewBlockDrag(prev => prev ? { ...prev, endPercent: percent } : null)
    }
    const handleUp = () => {
      const drag = newBlockDragRef.current
      if (!drag) {
        setNewBlockDrag(null)
        dragLayerRef.current = null
        return
      }
      const startPercent = Math.min(drag.startPercent, drag.endPercent)
      const endPercent = Math.max(drag.startPercent, drag.endPercent)
      const minDurationPercent = 0.5
      const effectiveEnd = endPercent - startPercent < minDurationPercent ? startPercent + minDurationPercent : endPercent
      const timelineStartMinutes = 2 * 60
      const visibleRangeMinutes = (zoomHours >= 24 ? zoomHours : 24) * 60
      const startM = selectedDayStart.clone().add(timelineStartMinutes + (startPercent / 100) * visibleRangeMinutes + 60, 'minutes')
      const endM = selectedDayStart.clone().add(timelineStartMinutes + (Math.min(100, effectiveEnd) / 100) * visibleRangeMinutes - 60, 'minutes')
      // Round to nearest 5 minutes
      const roundTo5 = (m) => {
        const clone = m.clone()
        const roundedMin = Math.round(clone.minute() / 5) * 5
        clone.minute(roundedMin).second(0).millisecond(0)
        if (roundedMin === 60) clone.add(1, 'hour').minute(0)
        return clone
      }
      const startTime = roundTo5(startM)
      const endTime = roundTo5(endM)
      if (startTime.isBefore(endTime)) {
        onNewBlockRange({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          group: drag.group
        })
      }
      setNewBlockDrag(null)
      newBlockDragRef.current = null
      dragLayerRef.current = null
      dragRectRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [newBlockDrag, onNewBlockRange, selectedDayStart, zoomHours])

  // Resize On Air block
  useEffect(() => {
    if (!resizeDrag || !onOnAirResize) return
    const handleMove = (e) => {
      if (!resizeDragRef.current?.rect) return
      const { rect, edge, startPercent, endPercent } = resizeDragRef.current
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      let newStart = startPercent
      let newEnd = endPercent
      if (edge === 'left') {
        newStart = Math.min(percent, endPercent - 0.5)
      } else {
        newEnd = Math.max(percent, startPercent + 0.5)
      }
      setResizeDrag(prev => {
        const next = prev ? { ...prev, startPercent: newStart, endPercent: newEnd } : null
        resizeDragRef.current = next
        return next
      })
    }
    const handleUp = () => {
      const drag = resizeDragRef.current
      if (!drag) {
        setResizeDrag(null)
        return
      }
      const timelineStartMinutes = 2 * 60
      const visibleRangeMinutes = (zoomHours >= 24 ? zoomHours : 24) * 60
      const startM = selectedDayStart.clone().add(timelineStartMinutes + (drag.startPercent / 100) * visibleRangeMinutes, 'minutes')
      const endM = selectedDayStart.clone().add(timelineStartMinutes + (drag.endPercent / 100) * visibleRangeMinutes, 'minutes')
      const roundTo5 = (m) => {
        const clone = m.clone()
        const roundedMin = Math.round(clone.minute() / 5) * 5
        clone.minute(roundedMin).second(0).millisecond(0)
        if (roundedMin === 60) clone.add(1, 'hour').minute(0)
        return clone
      }
      const startTime = roundTo5(startM)
      const endTime = roundTo5(endM)
      if (startTime.isBefore(endTime)) {
        onOnAirResize(drag.blockId, startTime.toISOString(), endTime.toISOString())
      }
      setResizeDrag(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizeDrag, onOnAirResize, selectedDayStart, zoomHours])

  // Move On Air block
  useEffect(() => {
    if (!moveDrag || !onOnAirResize) return
    const handleMove = (e) => {
      if (!moveDragRef.current?.rect) return
      const { rect, initialMouseX, initialStartPercent, initialEndPercent } = moveDragRef.current
      const percent = ((e.clientX - rect.left) / rect.width) * 100
      const deltaPercent = percent - initialMouseX
      let newStart = initialStartPercent + deltaPercent
      let newEnd = initialEndPercent + deltaPercent
      const width = initialEndPercent - initialStartPercent
      if (newStart < 0) {
        newStart = 0
        newEnd = width
      } else if (newEnd > 100) {
        newEnd = 100
        newStart = 100 - width
      }
      setMoveDrag(prev => {
        const next = prev ? { ...prev, startPercent: newStart, endPercent: newEnd } : null
        moveDragRef.current = next
        return next
      })
    }
    const handleUp = () => {
      const drag = moveDragRef.current
      if (!drag) {
        setMoveDrag(null)
        return
      }
      const timelineStartMinutes = 2 * 60
      const visibleRangeMinutes = (zoomHours >= 24 ? zoomHours : 24) * 60
      const startM = selectedDayStart.clone().add(timelineStartMinutes + (drag.startPercent / 100) * visibleRangeMinutes, 'minutes')
      const endM = selectedDayStart.clone().add(timelineStartMinutes + (drag.endPercent / 100) * visibleRangeMinutes, 'minutes')
      const roundTo5 = (m) => {
        const clone = m.clone()
        const roundedMin = Math.round(clone.minute() / 5) * 5
        clone.minute(roundedMin).second(0).millisecond(0)
        if (roundedMin === 60) clone.add(1, 'hour').minute(0)
        return clone
      }
      const startTime = roundTo5(startM)
      const endTime = roundTo5(endM)
      if (startTime.isBefore(endTime)) {
        onOnAirResize(drag.blockId, startTime.toISOString(), endTime.toISOString())
      }
      setMoveDrag(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [moveDrag, onOnAirResize, selectedDayStart, zoomHours])

  const handleMoveStart = (e, event) => {
    if (!onOnAirResize || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const timelineArea = e.currentTarget.closest('[data-timeline-area]')
    if (!timelineArea) return
    const rect = timelineArea.getBoundingClientRect()
    const percent = ((e.clientX - rect.left) / rect.width) * 100
    const startPercent = event.startPercent
    const endPercent = event.startPercent + event.widthPercent
    setMoveDrag({
      blockId: event.id,
      startPercent,
      endPercent,
      group: event.group,
      rect,
      initialMouseX: percent,
      initialStartPercent: startPercent,
      initialEndPercent: endPercent
    })
    moveDragRef.current = {
      blockId: event.id,
      startPercent,
      endPercent,
      group: event.group,
      rect,
      initialMouseX: percent,
      initialStartPercent: startPercent,
      initialEndPercent: endPercent
    }
  }

  const handleResizeStart = (e, event, edge) => {
    if (!onOnAirResize || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const timelineArea = e.currentTarget.closest('[data-timeline-area]')
    if (!timelineArea) return
    const rect = timelineArea.getBoundingClientRect()
    const startPercent = event.startPercent
    const endPercent = event.startPercent + event.widthPercent
    setResizeDrag({
      blockId: event.id,
      edge,
      startPercent,
      endPercent,
      group: event.group,
      rect
    })
    resizeDragRef.current = {
      blockId: event.id,
      edge,
      startPercent,
      endPercent,
      group: event.group,
      rect
    }
  }

  const handleItemClick = (event) => {
    const now = Date.now()
    const timeSinceLastClick = now - lastClickRef.current.time
    const isDoubleClick = lastClickRef.current.event?.id === event.id && timeSinceLastClick < 300

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    if (isDoubleClick) {
      // Double click detected
      if (onItemDoubleClick) {
        onItemDoubleClick(event)
      }
      lastClickRef.current = { event: null, time: 0 }
    } else {
      // Single click - wait a bit to see if it becomes a double click
      lastClickRef.current = { event, time: now }
      clickTimeoutRef.current = setTimeout(() => {
        if (onItemSelect) {
          onItemSelect(event)
        }
        lastClickRef.current = { event: null, time: 0 }
      }, 300)
    }
  }

  // Compute editing block outline position (when form is open, outline persists and updates with form times)
  const editingBlockOutline = useMemo(() => {
    if (!editingBlockDraft?.startTime || !editingBlockDraft?.endTime || !selectedDayStart) return null
    const start = moment.utc(editingBlockDraft.startTime).tz('Europe/Rome')
    const end = moment.utc(editingBlockDraft.endTime).tz('Europe/Rome')
    if (!start.isValid() || !end.isValid() || !start.isBefore(end)) return null
    const timelineStartMinutes = 2 * 60
    const effectiveZoomHours = zoomHours >= 24 ? zoomHours : 24
    const timelineEndMinutes = (effectiveZoomHours + 2) * 60
    const visibleRangeMinutes = timelineEndMinutes - timelineStartMinutes
    const startMinutesFromDayStart = start.diff(selectedDayStart, 'minutes')
    const endMinutesFromDayStart = end.diff(selectedDayStart, 'minutes')
    let startMinutesFromTimelineStart = startMinutesFromDayStart >= timelineStartMinutes ? startMinutesFromDayStart - timelineStartMinutes : 0
    let endMinutesFromTimelineStart
    if (endMinutesFromDayStart <= timelineEndMinutes) {
      endMinutesFromTimelineStart = endMinutesFromDayStart >= timelineStartMinutes ? endMinutesFromDayStart - timelineStartMinutes : 0
    } else {
      endMinutesFromTimelineStart = visibleRangeMinutes
    }
    if (endMinutesFromDayStart < startMinutesFromDayStart) {
      if (startMinutesFromDayStart >= timelineStartMinutes) endMinutesFromTimelineStart = visibleRangeMinutes
      else if (endMinutesFromDayStart <= 60) {
        startMinutesFromTimelineStart = 0
        endMinutesFromTimelineStart = endMinutesFromDayStart + (24 * 60 - timelineStartMinutes)
      }
    }
    const startPercent = Math.max(0, Math.min(100, (startMinutesFromTimelineStart / visibleRangeMinutes) * 100))
    const endPercent = Math.max(0, Math.min(100, (endMinutesFromTimelineStart / visibleRangeMinutes) * 100))
    const widthPercent = Math.max(0.5, endPercent - startPercent)
    return { startPercent, widthPercent, group: editingBlockDraft.group }
  }, [editingBlockDraft, selectedDayStart, zoomHours])

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No events to display
      </div>
    )
  }

  // 48h: day boundary at 50%; 36h: day boundary at 24/36 ≈ 66.67%
  const daySplitPercent = zoomHours === 48 ? 50 : zoomHours === 36 ? (100 * 24 / 36) : null
  const isMultiDay = daySplitPercent != null

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-gray-900">
      {/* Fixed header: date + time rows always visible (not inside scroll) */}
      <div ref={headerRef} className="flex-shrink-0 z-30 bg-gray-800 border-b-2 border-gray-600 relative">
          {/* Current time indicator line - spans all rows */}
          {currentTimePosition !== null && (
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{
                left: `calc(96px + (100% - 111px) * ${currentTimePosition / 100})`, // 96px label column + 15px scrollbar gutter; % of time area
                width: '2px',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)'
              }}
            >
              {/* Time label at top */}
              <div
                className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-b whitespace-nowrap"
                style={{ marginTop: '-1px' }}
              >
                {currentTime.format('HH:mm')}
              </div>
            </div>
          )}
          
          {/* Row 1: Date spanning all columns */}
        <div className="flex relative border-b border-gray-600">
          <div className="w-24 flex-shrink-0 border-r border-gray-600 bg-gray-800">
            {/* Empty - date removed from left column */}
          </div>
          <div className={`flex-1 flex relative pr-[15px] ${zoomHours < 24 ? 'overflow-x-auto' : ''}`} style={{ boxSizing: 'border-box' }}>
            {selectedDate ? (() => {
              const dateMoment = moment.tz(selectedDate, 'Europe/Rome')
              const day0Date = moment.tz('2026-02-06', 'Europe/Rome') // February 6 is DAY 0
              const dayDiff = dateMoment.diff(day0Date, 'days')
              const dayLabel = dayDiff === 0 ? 'DAY 00' : dayDiff > 0 ? `DAY ${String(dayDiff).padStart(2, '0')}` : `DAY -${String(Math.abs(dayDiff)).padStart(2, '0')}`
              
              // For 36h/48h zoom, show two day labels with a divider
              if (isMultiDay) {
                const nextDateMoment = dateMoment.clone().add(1, 'day')
                const nextDayDiff = nextDateMoment.diff(day0Date, 'days')
                const nextDayLabel = nextDayDiff === 0 ? 'DAY 00' : nextDayDiff > 0 ? `DAY ${String(nextDayDiff).padStart(2, '0')}` : `DAY -${String(Math.abs(nextDayDiff)).padStart(2, '0')}`
                
                return (
                  <>
                    {/* Left part - DAY 00 */}
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: `${daySplitPercent}%`, paddingTop: '5px', paddingBottom: '5px' }}>
                      <div className="font-semibold text-gray-200" style={{ fontSize: '1.2em' }}>
                        {dateMoment.format('dddd, MMMM D, YYYY')} - {dayLabel}
                      </div>
                    </div>
                    {/* Right part - DAY 01 */}
                    <div className="flex-1 flex items-center justify-center" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
                      <div className="font-semibold text-gray-200" style={{ fontSize: '1.2em' }}>
                        {nextDateMoment.format('dddd, MMMM D, YYYY')} - {nextDayLabel}
                      </div>
                    </div>
                  </>
                )
              }
              
              // For other zoom levels, show single centered date
              return (
                <div className="flex w-full items-center justify-center" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
                  <div className="font-semibold text-gray-200" style={{ fontSize: '1.2em' }}>
                    {dateMoment.format('dddd, MMMM D, YYYY')} - {dayLabel}
                  </div>
                </div>
              )
            })() : (
              <div className="flex w-full items-center justify-center" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
                <div className="font-semibold text-gray-200" style={{ fontSize: '1.2em' }}>Select Date</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Row 2: Milan (CET) times - ref for drag coords to match hour markers */}
        <div className="flex relative border-b border-gray-600">
          <div className="w-24 flex-shrink-0 border-r border-gray-600 bg-gray-800 p-2 font-semibold text-gray-200 flex items-center justify-center">
            <div className="text-xs text-gray-400">Milan (CET)</div>
          </div>
          <div ref={timelineHeaderTimeRef} className={`flex-1 flex relative pr-[15px] ${zoomHours < 24 ? 'overflow-x-auto' : ''}`} style={{ boxSizing: 'border-box' }}>
            <div className="flex w-full">
              {hours.map((hour, idx) => {
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-600 text-center p-1 text-base text-gray-400 font-medium"
                    style={{ 
                      width: `${100 / hours.length}%`,
                      minWidth: `${100 / hours.length}%`,
                      flexShrink: 0
                    }}
                  >
                    {hour.format('HH:mm')}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        
        {/* Row 3: ET times */}
        <div className="flex relative">
          <div className="w-24 flex-shrink-0 border-r border-gray-600 bg-gray-800 p-2 font-semibold text-gray-200 flex items-center justify-center">
            <div className="text-xs text-gray-400">ET</div>
          </div>
          <div className={`flex-1 flex relative pr-[15px] ${zoomHours < 24 ? 'overflow-x-auto' : ''}`} style={{ boxSizing: 'border-box' }}>
            <div className="flex w-full">
              {hours.map((hour, idx) => {
                // Convert Milan hour to EST for display
                const hourEST = hour.clone().tz('America/New_York')
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-600 text-center p-1 text-sm text-gray-500"
                    style={{ 
                      width: `${100 / hours.length}%`,
                      minWidth: `${100 / hours.length}%`,
                      flexShrink: 0
                    }}
                  >
                    {hourEST.format('HH:mm')}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable area: only timeline rows (date/time header stays fixed above) */}
      <div
        ref={scrollableRef}
        className={`flex-1 overflow-y-auto bg-gray-900 ${zoomHours < 24 ? 'overflow-x-auto' : ''} min-h-0 relative`}
        style={{ minHeight: 0, scrollbarGutter: 'stable' }}
        key={`scrollable-${groups.length}-${selectedDate}-${zoomHours}-${scrollPosition}`}
      >
        {/* Single day-boundary line: one element for all rows so it never misaligns */}
        {isMultiDay && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-500 z-20 pointer-events-none"
            style={{
              left: `calc(96px + (100% - 96px) * ${daySplitPercent / 100})`,
              transform: 'translateX(-50%)'
            }}
          />
        )}
        {/* Timeline rows */}
        <div className="w-full relative">
          {groups.map((group, groupIdx) => {
            // Check if this group has any blocks (CBC timeline) vs events (OBS timeline)
            const hasBlocks = itemsByGroup[group]?.some(item => item.block) || false
            
            // Check if all blocks in this row have minimal content
            const blocksInGroup = itemsByGroup[group]?.filter(item => item.block && !item.isEmpty) || []
            const allBlocksMinimal = blocksInGroup.length > 0 && blocksInGroup.every(item => {
              const block = item.block
              const hasBroadcastTimes = block.broadcast_start_time && block.broadcast_end_time
              const hasNetworksBooths = block.booths && block.booths.length > 0
              return !hasBroadcastTimes && !hasNetworksBooths
            })
            
            // Adjust row height based on content - minimal blocks get smaller rows
            const rowMinHeight = hasBlocks 
              ? (allBlocksMinimal ? '100px' : '200px')
              : '80px'
            
            // Check if this is a TX encoder row (CBC timeline)
            const isTXEncoder = /^TX\s*\d+$/i.test(group)
            
            return (
            <div
              key={group}
              className={`flex border-b border-gray-700 ${
                groupIdx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/80'
              }`}
              style={{ minHeight: rowMinHeight }}
            >
              {/* Group label */}
              <div className="w-24 flex-shrink-0 border-r border-gray-600 bg-gray-800 p-4 flex flex-col items-center justify-center">
                {isTXEncoder ? (
                  // CBC Timeline TX encoders: Always show TX, OLY, and RX labels
                  (() => {
                    // Extract TX number from encoder name (e.g., "TX 01" -> "01")
                    const txMatch = group.match(/TX\s*(\d+)/i)
                    const txNum = txMatch ? txMatch[1] : null
                    
                    // Generate OLY label: OLY + (900 + TX number) -> OLY901, OLY902, etc.
                    const olyLabel = txNum ? `OLY${900 + parseInt(txNum)}` : ''
                    
                    // Generate RX label from TX number (TX 01 -> RX 01)
                    const rxLabel = txNum ? `RX ${txNum.padStart(2, '0')}` : ''
                    
                    return (
                      <>
                        <div className="font-semibold text-gray-200 text-sm">{group}</div>
                        {olyLabel && (
                          <div className="font-semibold text-gray-200 text-sm mt-1">{olyLabel}</div>
                        )}
                        {rxLabel && (
                          <div className="font-semibold text-gray-200 text-sm mt-1">{rxLabel}</div>
                        )}
                      </>
                    )
                  })()
                ) : (
                  // OBS Timeline or other groups: Just show group name (centered like TX rows)
                  <div className="font-semibold text-gray-200 text-sm text-center">{group}</div>
                )}
              </div>

              {/* Timeline area */}
              <div
                data-timeline-area
                className="flex-1 relative"
                style={{ minHeight: rowMinHeight }}
                onDragOver={onBlockDropOnGroup && group === 'On Air' ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                onDrop={onBlockDropOnGroup && group === 'On Air' ? (e) => {
                  e.preventDefault()
                  const blockId = e.dataTransfer.getData('blockId') || e.dataTransfer.getData('text/plain')
                  if (blockId) onBlockDropOnGroup(blockId, group)
                } : undefined}
              >
                {/* Hour markers */}
                <div className="absolute inset-0 flex w-full">
                  {hours.map((_, idx) => (
                    <div
                      key={idx}
                      className="border-r border-gray-700"
                      style={{ 
                        width: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                        minWidth: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                        flexShrink: 0
                      }}
                    />
                  ))}
                </div>

                {/* Drag-to-create new block layer (CBC only): empty area triggers drag */}
                {onNewBlockRange && (
                  <div
                    className="absolute inset-0 z-[1] cursor-crosshair"
                    onMouseDown={(e) => handleNewBlockDragStart(e, group)}
                    aria-label="Drag to create new block"
                  />
                )}

                {/* Preview rectangle while dragging */}
                {newBlockDrag && newBlockDrag.group === group && (
                  <div
                    className="absolute top-2 bottom-2 z-[5] rounded-lg border-2 border-dashed border-blue-400 bg-blue-500/30 pointer-events-none"
                    style={{
                      left: `${Math.min(newBlockDrag.startPercent, newBlockDrag.endPercent)}%`,
                      width: `${Math.max(0.5, Math.abs(newBlockDrag.endPercent - newBlockDrag.startPercent))}%`
                    }}
                  />
                )}

                {/* Resize preview overlay for On Air blocks */}
                {resizeDrag && resizeDrag.group === group && (
                  <div
                    className="absolute top-2 bottom-2 z-[5] rounded-lg border-2 border-dashed border-amber-400 bg-amber-500/30 pointer-events-none"
                    style={{
                      left: `${Math.min(resizeDrag.startPercent, resizeDrag.endPercent)}%`,
                      width: `${Math.max(0.5, Math.abs(resizeDrag.endPercent - resizeDrag.startPercent))}%`
                    }}
                  />
                )}

                {/* Move preview overlay for On Air blocks */}
                {moveDrag && moveDrag.group === group && (
                  <div
                    className="absolute top-2 bottom-2 z-[5] rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-500/30 pointer-events-none"
                    style={{
                      left: `${Math.min(moveDrag.startPercent, moveDrag.endPercent)}%`,
                      width: `${Math.max(0.5, Math.abs(moveDrag.endPercent - moveDrag.startPercent))}%`
                    }}
                  />
                )}

                {/* Persistent outline while editing new block (updates with form start/end/broadcast times) */}
                {editingBlockOutline && editingBlockOutline.group === group && (
                  <div
                    className="absolute top-2 bottom-2 z-[5] rounded-lg border-2 border-dashed border-blue-400 bg-blue-500/30 pointer-events-none"
                    style={{
                      left: `${editingBlockOutline.startPercent}%`,
                      width: `${editingBlockOutline.widthPercent}%`
                    }}
                  />
                )}

                {/* Events */}
                {itemsByGroup[group]?.filter(event => {
                  if (event.isEmpty) return false
                  // Beauty cameras in 24h: always show when their date matches the view (they’re 02:00–04:00 that day)
                  if (event.isBeautyCamera && zoomHours === 24 && selectedDate) {
                    const beautyDate = event.startMilan && typeof event.startMilan.format === 'function'
                      ? event.startMilan.format('YYYY-MM-DD')
                      : (event.start_time ? moment.utc(event.start_time).tz('Europe/Rome').format('YYYY-MM-DD') : '')
                    if (beautyDate === selectedDate) return true
                  }
                  // Use same timeline range as positioning: 02:00 for zoomHours duration (24h, 36h, or 48h)
                  const timelineStartHour = 2
                  const timelineStartMinutes = timelineStartHour * 60
                  const effectiveZoomHours = zoomHours >= 24 ? zoomHours : 24
                  const timelineEndMinutes = (effectiveZoomHours + timelineStartHour) * 60
                  const eventStartMinutes = event.startMilan && typeof event.startMilan.diff === 'function'
                    ? event.startMilan.diff(selectedDayStart, 'minutes')
                    : (event.start_time ? moment.utc(event.start_time).tz('Europe/Rome').diff(selectedDayStart, 'minutes') : 0)
                  const eventEndMinutes = event.endMilan && typeof event.endMilan.diff === 'function'
                    ? event.endMilan.diff(selectedDayStart, 'minutes')
                    : (event.end_time ? moment.utc(event.end_time).tz('Europe/Rome').diff(selectedDayStart, 'minutes') : 0)
                  
                  // Show event if it overlaps with timeline range (02:00 to 02:00 + zoomHours)
                  const eventStartsInRange = eventStartMinutes >= timelineStartMinutes && eventStartMinutes < timelineEndMinutes
                  const eventEndsInRange = eventEndMinutes > timelineStartMinutes && eventEndMinutes <= timelineEndMinutes
                  const eventSpansRange = eventStartMinutes < timelineStartMinutes && eventEndMinutes > timelineEndMinutes
                  
                  return eventStartsInRange || eventEndsInRange || eventSpansRange
                }).map((event, eventIdx) => {
                  // For zoomed views, position is already relative to visible range
                  // For 24h view, clamp to visible day (0-100%)
                  let leftPercent = event.startPercent
                  let rightPercent = event.startPercent + event.widthPercent
                  
                  // Clamp to visible range (0-100%)
                  leftPercent = Math.max(0, Math.min(100, leftPercent))
                  rightPercent = Math.max(0, Math.min(100, rightPercent))
                  
                  const left = `${leftPercent}%`
                  const widthPercent = Math.max(rightPercent - leftPercent, 0.5)
                  const width = `${widthPercent}%` // Minimum 0.5% width
                  
                  // Calculate approximate pixel width for narrow block detection
                  // Estimate: timeline width is roughly viewport width minus label column (96px) minus padding
                  // For narrow block detection, we'll use a percentage threshold
                  const isNarrowBlock = widthPercent < 2 // Less than 2% of timeline width (roughly < 80px on typical screens)
                  
                  const isBlock = event.block
                  const block = event.block || {}
                  
                  // Check if this block/event is currently live (current time is within start and end) - using Milan time
                  const isLive = currentTime.isSameOrAfter(event.startMilan) && currentTime.isBefore(event.endMilan)
                  
                  // OBS events only: whether this event is already scheduled on the CBC timeline (used in JSX below)
                  let isScheduledOnCBC = false
                  
                  // Blocks: type from block.type. OBS events: infer type from title to match legend colors.
                  let backgroundColor
                  let borderColor
                  let textColor = 'text-white' // Default to white text
                  let borderStyle = 'solid' // Default to solid border
                  // Use same light-background list as legend so black text when background matches legend
                  const useBlackText = (bg) => LEGEND_LIGHT_BACKGROUNDS.includes(bg)

                  if (isBlock) {
                    backgroundColor = getBlockTypeColor(block.type)
                    borderColor = darkenColor(backgroundColor, 30)
                    if (isLive) borderStyle = 'dashed'
                    if (useBlackText(backgroundColor)) textColor = 'text-gray-900'
                  } else {
                    // OBS event: infer type from title → same colors as legend, black text on light backgrounds
                    const obsType = inferOBSEventDisplayType(event.title)
                    const baseBg = getBlockTypeColor(obsType)
                    isScheduledOnCBC = !!(scheduledOnCBCEventIds && scheduledOnCBCEventIds.has(String(event.id)))
                    // OBS event: same legend color for both scheduled and unscheduled; black text on light legend colors
                    backgroundColor = baseBg
                    borderColor = darkenColor(backgroundColor, 30)
                    if (useBlackText(backgroundColor)) textColor = 'text-gray-900'
                    if (isScheduledOnCBC) {
                      // Optional: slightly stronger border to show it's on CBC (colors match legend)
                      borderColor = darkenColor(backgroundColor, 45)
                    }
                    if (isLive) borderStyle = 'dashed'
                  }
                  
                  // Format times for display. Beauty cameras use stored 02:00–04:00; others use raw times.
                  const startMilan = (event.isBeautyCamera && event.startMilan) ? event.startMilan : moment.utc(event.start_time).tz('Europe/Rome')
                  const endMilan = (event.isBeautyCamera && event.endMilan) ? event.endMilan : moment.utc(event.end_time).tz('Europe/Rome')
                  const startEST = (event.isBeautyCamera && event.startEST) ? event.startEST : moment.utc(event.start_time).tz('America/New_York')
                  const endEST = (event.isBeautyCamera && event.endEST) ? event.endEST : moment.utc(event.end_time).tz('America/New_York')
                  
                  // Planning override (producer_broadcast_*) takes precedence for On Air blocks; else use block.broadcast_*
                  const override = event.override || {}
                  const broadcastStart = (override.producer_broadcast_start_time ? moment.utc(override.producer_broadcast_start_time).tz('Europe/Rome') : null) ||
                    (block.broadcast_start_time ? moment.utc(block.broadcast_start_time).tz('Europe/Rome') : null)
                  const broadcastEnd = (override.producer_broadcast_end_time ? moment.utc(override.producer_broadcast_end_time).tz('Europe/Rome') : null) ||
                    (block.broadcast_end_time ? moment.utc(block.broadcast_end_time).tz('Europe/Rome') : null)
                  // OBS event times (block start/end — original times, always shown in parentheses when we have broadcast times)
                  const obsStartMilan = isBlock && block.start_time ? moment.utc(block.start_time).tz('Europe/Rome') : null
                  const obsEndMilan = isBlock && block.end_time ? moment.utc(block.end_time).tz('Europe/Rome') : null
                  
                  // Check if block has minimal content (no broadcast times, no networks/booths)
                  // Only applies to blocks, not regular events
                  const hasBroadcastTimes = isBlock && broadcastStart && broadcastEnd
                  const hasNetworksBooths = isBlock && block.booths && block.booths.length > 0
                  const hasMinimalContent = isBlock && !hasBroadcastTimes && !hasNetworksBooths
                  
                  // Create a key that includes booth relationships for blocks to force re-render
                  const blockKey = isBlock && block.booths 
                    ? `${event.id}-${eventIdx}-${JSON.stringify(block.booths.map(b => ({ id: b.id, network_id: b.network_id, name: b.name })))}`
                    : `${event.id}-${eventIdx}`
                  
                  const isDraggable = onBlockDropOnGroup && event.block && event.group !== 'On Air'
                  const isOnAirResizable = onOnAirResize && event.group === 'On Air' && event.block && !event.isEmpty
                  const isOnAirMovable = isOnAirResizable
                  const isResizing = resizeDrag?.blockId === event.id
                  const isMoving = moveDrag?.blockId === event.id
                  return (
                    <div
                      key={blockKey}
                      draggable={!!isDraggable}
                      onDragStart={isDraggable ? (e) => {
                        e.dataTransfer.setData('blockId', String(event.id))
                        e.dataTransfer.setData('text/plain', String(event.id))
                        e.dataTransfer.effectAllowed = 'move'
                      } : undefined}
                      onMouseDown={isOnAirMovable && !isResizing ? (e) => handleMoveStart(e, event) : undefined}
                      onClick={() => !isResizing && !isMoving && handleItemClick(event)}
                      className={`absolute rounded-lg shadow-md hover:shadow-lg transition-all duration-200 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : isOnAirMovable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group ${hasMinimalContent ? 'top-1 bottom-1' : 'top-2 bottom-2'} ${(isResizing || isMoving) ? 'opacity-30' : ''}`}
                      style={{
                        left,
                        width,
                        minWidth: isOnAirResizable ? '50px' : (isBlock ? '40px' : '40px'),
                        backgroundColor,
                        border: `2px ${borderStyle} ${borderColor}`,
                        zIndex: 10,
                        height: hasMinimalContent ? undefined : (isBlock ? 'auto' : undefined),
                        minHeight: hasMinimalContent ? undefined : (isBlock ? 'auto' : undefined)
                      }}
                      title={`${block.name || event.title}${hasBroadcastTimes ? `\n(${obsStartMilan?.format('HH:mm')} - ${obsEndMilan?.format('HH:mm')})\n${broadcastStart.format('HH:mm')} - ${broadcastEnd.format('HH:mm')}` : `\n${startMilan.format('HH:mm')} - ${endMilan.format('HH:mm')}`}${block.obs_group ? `\n${block.obs_group}` : ''}`}
                    >
                      {/* External label for very narrow blocks */}
                      {isNarrowBlock && isBlock && (
                        <div 
                          className="absolute left-full ml-1 top-0 whitespace-nowrap text-[11px] text-gray-300 z-20 pointer-events-none"
                          style={{ maxWidth: '200px' }}
                        >
                          {block.name || event.title}
                        </div>
                      )}
                      {/* Resize handles for On Air blocks */}
                      {isOnAirResizable && !isResizing && (
                        <>
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 hover:bg-white/20 rounded-l-lg"
                            onMouseDown={(e) => handleResizeStart(e, event, 'left')}
                            title="Drag to resize"
                          />
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 hover:bg-white/20 rounded-r-lg"
                            onMouseDown={(e) => handleResizeStart(e, event, 'right')}
                            title="Drag to resize"
                          />
                        </>
                      )}
                      {/* Live indicator: red circle (bigger, matches maple leaf height); OBS events */}
                      {isLive && !isBlock && (
                        <div
                          className="absolute top-2 right-2 z-20 w-[18px] h-[18px] rounded-full bg-red-500 animate-live-pulse flex items-center justify-center"
                          title="Live"
                          aria-hidden
                        />
                      )}
                      {isBlock ? (
                        // Block display with metadata - matching the provided format
                        <div 
                          className={`flex flex-col ${isNarrowBlock ? 'text-[10px] leading-tight' : 'text-[14.6px] leading-tight'} ${textColor} relative ${hasMinimalContent ? 'p-1' : (isNarrowBlock ? 'p-0.5' : 'p-2')}`}
                          style={{ minHeight: hasMinimalContent ? 'auto' : '100%' }}
                        >
                          {/* Top right: maple leaf (if Canadian) and live circle (if live), aligned */}
                          {(block.canadian_content || isLive) && (
                            <div className="absolute top-2 right-2 z-20 flex items-center justify-end gap-2">
                              {block.canadian_content && (
                                <span className="text-red-600 text-lg leading-none shrink-0" style={{ lineHeight: '1' }}>
                                  🍁
                                </span>
                              )}
                              {isLive && (
                                <div
                                  className="w-[18px] h-[18px] rounded-full bg-red-500 animate-live-pulse shrink-0"
                                  title="Live"
                                  aria-hidden
                                />
                              )}
                            </div>
                          )}
                          
                          {/* Time display: In brackets = OBS event times (block start/end). Below = broadcast start/end. If no broadcast, single line without brackets. */}
                          {hasBroadcastTimes ? (
                            <>
                              {/* OBS event times in parentheses (first line) - block start/end */}
                              {obsStartMilan && obsEndMilan && !isNarrowBlock && (
                                <div className={`${isNarrowBlock ? 'text-[9px]' : 'text-[13.3px]'} opacity-90 mb-0.5`}>
                                  ({obsStartMilan.format('HH:mm')} - {obsEndMilan.format('HH:mm')})
                                </div>
                              )}
                              {/* Broadcast times (second line) */}
                              <div className={`${isNarrowBlock ? 'text-[9px]' : 'text-[13.3px]'} opacity-90 ${isNarrowBlock ? 'mb-0.5' : 'mb-1'}`}>
                                {broadcastStart.format('HH:mm')} - {broadcastEnd.format('HH:mm')}
                              </div>
                            </>
                          ) : (
                            /* No broadcast: single line using block times (position uses effective times) */
                            <div className={`${isNarrowBlock ? 'text-[9px]' : 'text-[13.3px]'} opacity-90 ${isNarrowBlock ? 'mb-0.5' : 'mb-1'}`}>
                              {startMilan.format('HH:mm')} - {endMilan.format('HH:mm')}
                            </div>
                          )}
                          
                          {/* DX Channel from OBS or Encoder/Suite identifier (third line) - hide for very narrow blocks */}
                          {!isNarrowBlock && (
                            <>
                              {block.obs_group ? (
                                <div className={`font-semibold mb-1 ${isNarrowBlock ? 'text-[9px]' : 'text-[13.3px]'}`}>
                                  {block.obs_group}
                                </div>
                              ) : (block.encoder || block.suite) ? (
                                <div className={`font-semibold mb-1 ${isNarrowBlock ? 'text-[9px]' : 'text-[13.3px]'}`}>
                                  {block.encoder?.name || ''} {block.encoder && block.suite ? '-' : ''} {block.suite?.name || ''}
                                </div>
                              ) : null}
                            </>
                          )}
                          
                          {/* Event name (fourth line) - wrap to show full title, truncate for narrow blocks */}
                          <div className={`font-medium ${isNarrowBlock ? 'mb-0.5 text-[9px] truncate' : 'mb-1 text-[14.6px] break-words'}`}>
                            {block.name || event.title}
                          </div>
                          
                          {/* Networks and Booths - one per line: "CBC TV : VIS" format - hide for narrow blocks */}
                          {/* Match each network to its booth using network_id */}
                          {(() => {
                            // Define the three network labels in order (with proper capitalization)
                            // Flexible network name matching
                            const matchNetworkName = (networkName) => {
                              if (!networkName) return null
                              const nameLower = networkName.toLowerCase().trim()
                              // CBC TV
                              if (nameLower === 'cbc tv' || nameLower.includes('cbc tv')) {
                                return { label: 'CBC TV', order: 0 }
                              }
                              // CBC Gem / CBC Web / Gem / Web
                              // Note: Database has 'Gem' but we display it as 'CBC Gem'
                              if (nameLower === 'cbc gem' || nameLower === 'cbc web' || 
                                  nameLower === 'gem' || nameLower === 'web' ||
                                  nameLower.includes('cbc gem') || nameLower.includes('cbc web')) {
                                return { label: 'CBC Gem', order: 1 }
                              }
                              // R-C TV/Web (handle various formats)
                              if (nameLower.includes('r-c') || nameLower.includes('rc tv') || 
                                  nameLower.includes('radio-canada')) {
                                return { label: 'R-C TV/Web', order: 2 }
                              }
                              return null
                            }
                            
                            const displayItems = []
                            
                            // Match each network to its corresponding booth using network_id
                            // The block.booths array contains booth entries with network_id
                            // Iterate through booths and match them to networks
                            
                            // Use a Set to track which networks we've already added (to avoid duplicates)
                            const addedNetworks = new Set()
                            
                            if (block.booths && block.booths.length > 0) {
                              // Iterate through booths and match them to networks
                              block.booths.forEach((booth) => {
                                // Get the network_id from the booth
                                const boothNetworkId = booth.network_id || (booth.network ? booth.network.id : null)
                                
                                if (boothNetworkId && !addedNetworks.has(boothNetworkId)) {
                                  // Find the network that matches this network_id
                                  const network = block.networks?.find(n => n.id === boothNetworkId)
                                  
                                  if (network) {
                                    // Use flexible matching to get display label
                                    const match = matchNetworkName(network.name)
                                    if (match) {
                                      // Get booth name - handle both direct name and nested booth object
                                      const boothName = booth.name || (booth.booth ? booth.booth.name : '')
                                      
                                      if (boothName) {
                                        addedNetworks.add(boothNetworkId)
                                        displayItems.push({ 
                                          networkName: match.label, 
                                          boothName: boothName,
                                          sortOrder: match.order
                                        })
                                      }
                                    }
                                  }
                                } else if (booth.network && booth.network.name && !addedNetworks.has(booth.network.id)) {
                                  // Fallback: use network name from booth.network object
                                  const match = matchNetworkName(booth.network.name)
                                  if (match) {
                                    // Get booth name - handle both direct name and nested booth object
                                    const boothName = booth.name || (booth.booth ? booth.booth.name : '')
                                    
                                    if (boothName) {
                                      addedNetworks.add(booth.network.id)
                                      displayItems.push({ 
                                        networkName: match.label, 
                                        boothName: boothName,
                                        sortOrder: match.order
                                      })
                                    }
                                  }
                                }
                              })
                            }
                            
                            // Sort display items to maintain consistent order (CBC TV, CBC Gem, R-C TV/Web)
                            displayItems.sort((a, b) => {
                              return a.sortOrder - b.sortOrder
                            })
                            
                            return displayItems.length > 0 && !isNarrowBlock ? (
                              <div className="mt-auto space-y-0.5 mb-1">
                                {displayItems.map((item, idx) => (
                                  <div key={idx} className="text-[13.3px] opacity-90">
                                    {item.networkName} : {item.boothName}
                                  </div>
                                ))}
                              </div>
                            ) : null
                          })()}
                        </div>
                      ) : (
                        // Regular event display (OBS) — same legend colors; blue stripe only in content area; grey bar radius matches block
                        <div className={`h-full flex flex-col rounded-b-lg overflow-hidden ${textColor}`}>
                          <div className="flex-1 flex items-center px-2 relative min-h-0">
                            {isScheduledOnCBC && (
                              <div
                                className="absolute left-0 top-0 bottom-0 w-1 rounded-tl-md"
                                style={{ backgroundColor: '#2563eb' }}
                                aria-hidden
                              />
                            )}
                            <div className="truncate text-xs font-medium">{event.title}</div>
                          </div>
                          <div className="text-[11px] font-semibold px-1 py-0.5 flex-shrink-0 w-full bg-gray-700 text-gray-200 rounded-b-lg">
                            <div className="flex justify-between items-center gap-1">
                              <span className="truncate">
                                Milan: {startMilan.format('HH:mm')}-{endMilan.format('HH:mm')}
                              </span>
                              <span className="truncate">
                                ET: {startEST.format('HH:mm')}-{endEST.format('HH:mm')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ModernTimeline
