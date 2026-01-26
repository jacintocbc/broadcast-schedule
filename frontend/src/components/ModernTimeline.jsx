import { useMemo, useRef, useEffect, useState } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { getBlockTypeColor, darkenColor } from '../utils/blockTypes'

function ModernTimeline({ events, selectedDate, onItemSelect, onItemDoubleClick, datePickerHeight = 0, navbarHeight = 73, zoomHours = 24, scrollPosition = 0 }) {
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const scrollableRef = useRef(null)
  const [availableHeight, setAvailableHeight] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => moment.tz('America/New_York'))
  
  // Calculate selectedDayStart outside useMemo so it's available in render
  // Use Milan timezone as the default
  const selectedDayStart = useMemo(() => {
    return selectedDate 
      ? moment.tz(selectedDate, 'Europe/Rome').startOf('day')
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
    // Check if current time is within the selected day
    const currentDayStart = currentTime.clone().startOf('day')
    const isToday = currentDayStart.isSame(selectedDayStart, 'day')
    
    if (!isToday) {
      return null // Don't show line if current time is not in the selected day
    }
    
    // Timeline spans from 02:00 (2 AM) to 02:00 (2 AM next day)
    const timelineStartHour = 2
    const timelineStartMinutes = timelineStartHour * 60 // 02:00 = 120 minutes from day start
    const timelineEndMinutes = (24 + 2) * 60 // 02:00 next day = 1560 minutes from day start
    const visibleRangeMinutes = timelineEndMinutes - timelineStartMinutes // 1440 minutes (24 hours)
    
    // Calculate current time position in minutes from day start
    const currentMinutesFromDayStart = currentTime.diff(selectedDayStart, 'minutes')
    
    // Check if current time is within timeline range (02:00 to 02:00 next day)
    // Handle case where current time might be after midnight but before 02:00 next day
    const isInRange = (currentMinutesFromDayStart >= timelineStartMinutes && currentMinutesFromDayStart <= timelineEndMinutes) ||
                      (currentMinutesFromDayStart >= 0 && currentMinutesFromDayStart <= 120) // 00:00 to 02:00
    
    if (!isInRange) {
      return null // Don't show line if current time is outside timeline range
    }
    
    // Calculate position relative to timeline start (02:00)
    let currentMinutesFromTimelineStart
    if (currentMinutesFromDayStart >= timelineStartMinutes) {
      // Current time is between 02:00 and 24:00
      currentMinutesFromTimelineStart = currentMinutesFromDayStart - timelineStartMinutes
    } else {
      // Current time is between 00:00 and 02:00 (next day)
      currentMinutesFromTimelineStart = (24 * 60 - timelineStartMinutes) + currentMinutesFromDayStart
    }
    
    // Calculate position as percentage
    const positionPercent = (currentMinutesFromTimelineStart / visibleRangeMinutes) * 100
    
    return positionPercent
  }, [currentTime, selectedDayStart])

  const { hours, groups, itemsByGroup } = useMemo(() => {
    if (!events || events.length === 0) {
      return { hours: [], groups: [], itemsByGroup: {} }
    }

    // Generate hours: start at 02:00 (2 AM) and end at 02:00 (2 AM next day) - 24 hour span
    // This spans from 02:00, 03:00, ..., 23:00, 00:00, 01:00, 02:00 (24 hours total, wrapping around)
    const startHour = 2 // Start at 2 AM
    const totalHours = 24 // 02:00 to 02:00 next day (24 hour markers)
    const hours = Array.from({ length: totalHours }, (_, i) => {
      const hour = selectedDayStart.clone().add(startHour + i, 'hours')
      // If hour goes past midnight, it will automatically roll to next day
      return hour
    })

    // Get unique groups (channels)
    const uniqueGroups = [...new Set(events.map(e => e.group).filter(Boolean))]
    
    // Custom sort: DX01 first, then DX02-DX99 numerically, then TX 01-27 numerically, then others alphabetically
    const groups = uniqueGroups.sort((a, b) => {
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
          const endUTC = moment.utc(event.end_time)
          
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
          // Timeline spans from 02:00 (2 AM) to 02:00 (2 AM next day) - 24 hours = 1440 minutes
          const timelineStartHour = 2
          const timelineStartMinutes = timelineStartHour * 60 // 02:00 = 120 minutes from day start
          const timelineEndMinutes = (24 + 2) * 60 // 02:00 next day = 1560 minutes from day start (24 hours + 2 hours)
          const visibleRangeMinutes = timelineEndMinutes - timelineStartMinutes // 1440 minutes (24 hours)
          
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
          
          // For 0-duration OBS events (yellow objects), make them span the full timeline range
          let startPercent, widthPercent
          if (isZeroDuration && isOBSEvent) {
            // OBS event: position at start of timeline (0%) and span full visible range (100%)
            startPercent = 0
            widthPercent = 100
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
          
          // Store Milan times for display (primary) and EST (secondary)
          // Also store timeline-relative positions for filtering
          return {
            ...event,
            startPercent,
            widthPercent,
            startHour,
            startMinute,
            endHour,
            endMinute,
            durationMinutes,
            isZeroDuration: durationMinutes === 0,
            startMilan: start,
            endMilan: end,
            startEST: startEST,
            endEST: endEST,
            startMinutesFromDayStart, // Keep for filtering calculations
            endMinutesFromDayStart // Keep for filtering calculations
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

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No events to display
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-white">
      {/* Header with hours - Fixed */}
      <div ref={headerRef} className="flex-shrink-0 bg-white border-b-2 border-gray-200 shadow-sm sticky z-30 relative" style={{ top: `${navbarHeight + datePickerHeight - 1}px` }}>
        {/* Current time indicator line - spans all rows */}
        {currentTimePosition !== null && (
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{
              left: `calc(96px + ${currentTimePosition}%)`, // 96px = width of left column (w-24 = 6rem = 96px)
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
        <div className="flex relative border-b border-gray-200">
          <div className="w-24 flex-shrink-0 border-r border-gray-300 bg-gray-50">
            {/* Empty - date removed from left column */}
          </div>
          <div className={`flex-1 flex relative ${zoomHours < 24 ? 'overflow-x-auto' : ''}`}>
            <div className="flex w-full items-center justify-center" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
              {selectedDate ? (() => {
                const dateMoment = moment.tz(selectedDate, 'Europe/Rome')
                const day0Date = moment.tz('2026-02-06', 'Europe/Rome') // February 6 is DAY 0
                const dayDiff = dateMoment.diff(day0Date, 'days')
                // Format day label with leading zeros: DAY 00, DAY -02, DAY +02, etc.
                // Format day label with leading zeros: DAY 00, DAY -02, DAY 02, etc.
                const dayLabel = dayDiff === 0 ? 'DAY 00' : dayDiff > 0 ? `DAY ${String(dayDiff).padStart(2, '0')}` : `DAY -${String(Math.abs(dayDiff)).padStart(2, '0')}`
                return (
                  <div className="font-semibold text-gray-700" style={{ fontSize: '1.2em' }}>
                    {dateMoment.format('dddd, MMMM D, YYYY')} - {dayLabel}
                  </div>
                )
              })() : (
                <div className="font-semibold text-gray-700" style={{ fontSize: '1.2em' }}>Select Date</div>
              )}
            </div>
          </div>
        </div>
        
        {/* Row 2: Milan (CET) times */}
        <div className="flex relative border-b border-gray-200">
          <div className="w-24 flex-shrink-0 border-r border-gray-300 bg-gray-50 p-2 font-semibold text-gray-700 flex items-center justify-center">
            <div className="text-xs text-gray-600">Milan (CET)</div>
          </div>
          <div className={`flex-1 flex relative ${zoomHours < 24 ? 'overflow-x-auto' : ''}`}>
            <div className="flex w-full">
              {hours.map((hour, idx) => {
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-200 text-center p-1 text-base text-gray-600 font-medium"
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
          <div className="w-24 flex-shrink-0 border-r border-gray-300 bg-gray-50 p-2 font-semibold text-gray-700 flex items-center justify-center">
            <div className="text-xs text-gray-600">ET</div>
          </div>
          <div className={`flex-1 flex relative ${zoomHours < 24 ? 'overflow-x-auto' : ''}`}>
            <div className="flex w-full">
              {hours.map((hour, idx) => {
                // Convert Milan hour to EST for display
                const hourEST = hour.clone().tz('America/New_York')
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-200 text-center p-1 text-sm text-gray-400"
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

      {/* Timeline rows - Scrollable */}
      <div 
        ref={scrollableRef}
        className={`flex-1 overflow-y-auto bg-white ${zoomHours < 24 ? 'overflow-x-auto' : ''}`}
        style={{ 
          minHeight: 0,
          height: 0
        }}
        key={`scrollable-${groups.length}-${selectedDate}-${zoomHours}-${scrollPosition}`}
      >
        <div className="w-full">
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
              className={`flex border-b border-gray-100 ${
                groupIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
              style={{ minHeight: rowMinHeight }}
            >
              {/* Group label */}
              <div className="w-24 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center">
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
                        <div className="font-semibold text-gray-800 text-sm">{group}</div>
                        {olyLabel && (
                          <div className="font-semibold text-gray-800 text-sm mt-1">{olyLabel}</div>
                        )}
                        {rxLabel && (
                          <div className="font-semibold text-gray-800 text-sm mt-1">{rxLabel}</div>
                        )}
                      </>
                    )
                  })()
                ) : (
                  // OBS Timeline or other groups: Just show group name
                  <div className="font-semibold text-gray-800 text-sm">{group}</div>
                )}
              </div>

              {/* Timeline area */}
              <div className="flex-1 relative" style={{ minHeight: rowMinHeight }}>
                {/* Hour markers */}
                <div className="absolute inset-0 flex w-full">
                  {hours.map((_, idx) => (
                    <div
                      key={idx}
                      className="border-r border-gray-100"
                      style={{ 
                        width: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                        minWidth: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                        flexShrink: 0
                      }}
                    />
                  ))}
                </div>

                {/* Events */}
                {itemsByGroup[group]?.filter(event => {
                  if (event.isEmpty) return false
                  // Filter events that are outside the timeline range (02:00 to 02:00)
                  const timelineStartHour = 2
                  const timelineStartMinutes = timelineStartHour * 60
                  const timelineEndMinutes = (24 + 2) * 60
                  const eventStartMinutes = event.startMilan.diff(selectedDayStart, 'minutes')
                  const eventEndMinutes = event.endMilan.diff(selectedDayStart, 'minutes')
                  
                  // Show event if it overlaps with timeline range (02:00 to 02:00)
                  // Handle events that span midnight
                  const eventStartsInRange = (eventStartMinutes >= timelineStartMinutes && eventStartMinutes <= timelineEndMinutes) ||
                                            (eventStartMinutes >= 0 && eventStartMinutes <= 120)
                  const eventEndsInRange = (eventEndMinutes >= timelineStartMinutes && eventEndMinutes <= timelineEndMinutes) ||
                                          (eventEndMinutes >= 0 && eventEndMinutes <= 120)
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
                  const width = `${Math.max(rightPercent - leftPercent, 0.5)}%` // Minimum 0.5% width
                  
                  const isBlock = event.block
                  const block = event.block || {}
                  
                  // Check if this block/event is currently live (current time is within start and end) - using Milan time
                  const isLive = currentTime.isSameOrAfter(event.startMilan) && currentTime.isBefore(event.endMilan)
                  
                  // Use yellow for 0-duration events, blue for normal events, type-based color for blocks
                  let backgroundColor
                  let borderColor
                  let textColor = 'text-white' // Default to white text
                  let borderStyle = 'solid' // Default to solid border
                  
                  if (event.isZeroDuration) {
                    backgroundColor = '#eab308'
                    borderColor = '#ca8a04'
                  } else if (isBlock) {
                    // Get color from block type, or use default green
                    backgroundColor = getBlockTypeColor(block.type)
                    // Use a darker version of the background color for the border
                    borderColor = darkenColor(backgroundColor, 30)
                    
                    // Use dashed border for live blocks
                    if (isLive) {
                      borderStyle = 'dashed'
                    }
                    
                    // Use dark text for light backgrounds (white and light pastel colors)
                    // Light colors have high RGB values (above ~200 for each channel)
                    const lightColors = ['#ffffff', '#fef08a', '#bbf7d0', '#fed7aa', '#bfdbfe', 
                                        '#fbcfe8', '#e5e7eb', '#9ca3af', '#fce7f3', '#e9d5ff', '#fde047']
                    if (lightColors.includes(backgroundColor)) {
                      textColor = 'text-gray-900'
                    }
                  } else {
                    backgroundColor = '#3b82f6'
                    borderColor = '#2563eb'
                    // Use dashed border for live events
                    if (isLive) {
                      borderStyle = 'dashed'
                    }
                  }
                  
                  // Format times for display - explicitly parse as UTC first, then convert to Milan (primary)
                  const startMilan = moment.utc(event.start_time).tz('Europe/Rome')
                  const endMilan = moment.utc(event.end_time).tz('Europe/Rome')
                  const startEST = moment.utc(event.start_time).tz('America/New_York')
                  const endEST = moment.utc(event.end_time).tz('America/New_York')
                  
                  const broadcastStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time).tz('Europe/Rome') : null
                  const broadcastEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time).tz('Europe/Rome') : null
                  
                  // Check if block has minimal content (no broadcast times, no networks/booths)
                  // Only applies to blocks, not regular events
                  const hasBroadcastTimes = isBlock && broadcastStart && broadcastEnd
                  const hasNetworksBooths = isBlock && block.booths && block.booths.length > 0
                  const hasMinimalContent = isBlock && !hasBroadcastTimes && !hasNetworksBooths
                  
                  // Create a key that includes booth relationships for blocks to force re-render
                  const blockKey = isBlock && block.booths 
                    ? `${event.id}-${eventIdx}-${JSON.stringify(block.booths.map(b => ({ id: b.id, network_id: b.network_id, name: b.name })))}`
                    : `${event.id}-${eventIdx}`
                  
                  return (
                    <div
                      key={blockKey}
                      onClick={() => handleItemClick(event)}
                      className={`absolute rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer group ${hasMinimalContent ? 'top-1 bottom-1' : 'top-2 bottom-2'}`}
                      style={{
                        left,
                        width,
                        minWidth: isBlock ? '200px' : '120px',
                        backgroundColor,
                        border: `2px ${borderStyle} ${borderColor}`,
                        zIndex: 10,
                        height: hasMinimalContent ? undefined : (isBlock ? 'auto' : undefined),
                        minHeight: hasMinimalContent ? undefined : (isBlock ? 'auto' : undefined)
                      }}
                      title={event.title}
                    >
                      {isBlock ? (
                        // Block display with metadata - matching the provided format
                        <div 
                          className={`flex flex-col text-[14.6px] leading-tight ${textColor} relative ${hasMinimalContent ? 'p-1' : 'p-2'}`}
                          style={{ minHeight: hasMinimalContent ? 'auto' : '100%' }}
                        >
                          {/* Canadian Content Maple Leaf - top right corner */}
                          {block.canadian_content && (
                            <div className="absolute top-2 right-2 text-red-600 text-lg leading-none" style={{ lineHeight: '1' }}>
                              🍁
                            </div>
                          )}
                          
                          {/* Time display: If broadcast times exist, show actual times in brackets first, then broadcast times below. Otherwise, show actual times without brackets */}
                          {hasBroadcastTimes ? (
                            <>
                              {/* Actual event times in parentheses (first line) - Milan time */}
                              <div className="text-[13.3px] opacity-90 mb-0.5">
                                ({startMilan.format('HH:mm')} - {endMilan.format('HH:mm')})
                              </div>
                              {/* Broadcast times without parentheses (second line) - Milan time */}
                              <div className="text-[13.3px] opacity-90 mb-1">
                                {broadcastStart.format('HH:mm')} - {broadcastEnd.format('HH:mm')}
                              </div>
                            </>
                          ) : (
                            /* Actual event times without parentheses (only line) - Milan time */
                            <div className="text-[13.3px] opacity-90 mb-1">
                              {startMilan.format('HH:mm')} - {endMilan.format('HH:mm')}
                            </div>
                          )}
                          
                          {/* DX Channel from OBS or Encoder/Suite identifier (third line) */}
                          {block.obs_group ? (
                            <div className="font-semibold mb-1 text-[13.3px]">
                              {block.obs_group}
                            </div>
                          ) : (block.encoder || block.suite) ? (
                            <div className="font-semibold mb-1 text-[13.3px]">
                              {block.encoder?.name || ''} {block.encoder && block.suite ? '-' : ''} {block.suite?.name || ''}
                            </div>
                          ) : null}
                          
                          {/* Event name (fourth line) - wrap to show full title */}
                          <div className="font-medium mb-1 text-[14.6px] break-words">
                            {block.name || event.title}
                          </div>
                          
                          {/* Networks and Booths - one per line: "CBC TV : VIS" format */}
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
                            
                            return displayItems.length > 0 ? (
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
                        // Regular event display
                        <div className="h-full flex flex-col text-white">
                          <div className="flex-1 flex items-center px-2">
                            <div className="truncate text-xs font-medium">{event.title}</div>
                          </div>
                          {/* Time label overlay - show both Milan and EST time, constrained to bottom, full width */}
                          <div className="bg-black bg-opacity-30 text-white text-[9px] px-1 py-0.5 rounded-b-lg flex-shrink-0 w-full">
                            <div className="flex justify-between items-center gap-1">
                              <span className="truncate">
                                Milan: {startMilan.format('HH:mm')}-{endMilan.format('HH:mm')}
                              </span>
                              <span className="text-gray-300 truncate">
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
