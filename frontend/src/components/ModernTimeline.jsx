import { useMemo, useRef, useEffect, useState } from 'react'
import moment from 'moment'
import 'moment-timezone'

function ModernTimeline({ events, selectedDate, onItemSelect, onItemDoubleClick, datePickerHeight = 0, navbarHeight = 73 }) {
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const scrollableRef = useRef(null)
  const [availableHeight, setAvailableHeight] = useState(null)
  const { hours, groups, itemsByGroup } = useMemo(() => {
    if (!events || events.length === 0) {
      return { hours: [], groups: [], itemsByGroup: {} }
    }

    // Generate 24 hours for the day in EST timezone for display
    const dayStart = selectedDate 
      ? moment.tz(selectedDate, 'America/New_York').startOf('day')
      : moment.tz('America/New_York').startOf('day')
    const hours = Array.from({ length: 24 }, (_, i) => 
      dayStart.clone().add(i, 'hours')
    )

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
    // Parse selected date in EST timezone for display
    const selectedDayStart = selectedDate 
      ? moment.tz(selectedDate, 'America/New_York').startOf('day')
      : moment.tz('America/New_York').startOf('day')
    
    groups.forEach(group => {
      itemsByGroup[group] = events
        .filter(e => e.group === group)
        .map((event, index) => {
          // Parse times - backend stores ISO strings in UTC (e.g., "2026-02-01T11:00:00.000Z")
          // Explicitly parse as UTC to ensure correct conversion
          const startUTC = moment.utc(event.start_time)
          const endUTC = moment.utc(event.end_time)
          
          // Convert to EST for positioning on timeline
          const start = startUTC.tz('America/New_York')
          const end = endUTC.tz('America/New_York')
          
          // Also get Rome time for labels (convert from UTC back to Rome)
          const startRome = startUTC.tz('Europe/Rome')
          const endRome = endUTC.tz('Europe/Rome')
          
          // Use the actual start and end times directly (not clamped to day boundaries)
          // Calculate position within the selected day (in EST)
          const startHour = start.hour()
          const startMinute = start.minute()
          const endHour = end.hour()
          const endMinute = end.minute()
          
          // Calculate position relative to the selected day start (in minutes)
          const startMinutesFromDayStart = start.diff(selectedDayStart, 'minutes')
          const endMinutesFromDayStart = end.diff(selectedDayStart, 'minutes')
          
          // Convert to percentage of the day
          const startPercent = (startMinutesFromDayStart / (24 * 60)) * 100
          const endPercent = (endMinutesFromDayStart / (24 * 60)) * 100
          
          // Calculate duration and width
          const durationMinutes = end.diff(start, 'minutes')
          // For 0-duration events, use minimum 3 hours width
          const minDurationMinutes = durationMinutes === 0 ? 180 : durationMinutes
          const widthPercent = (minDurationMinutes / (24 * 60)) * 100
          
          // Store Rome times for display
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
            startRome: startRome,
            endRome: endRome,
            startEST: start,
            endEST: end
          }
        })
        .sort((a, b) => a.startPercent - b.startPercent)
    })

    return { hours, groups, itemsByGroup }
  }, [events, selectedDate])

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
      <div ref={headerRef} className="flex-shrink-0 bg-white border-b-2 border-gray-200 shadow-sm sticky z-30" style={{ top: `${navbarHeight + datePickerHeight - 1}px` }}>
        <div className="flex">
          <div className="w-32 flex-shrink-0 border-r border-gray-300 bg-gray-50 p-2 font-semibold text-gray-700">
            <div className="text-sm">
              {selectedDate ? moment.tz(selectedDate, 'America/New_York').format('dddd, MMMM D') : 'Select Date'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              EST / Rome
            </div>
          </div>
          <div className="flex-1 flex overflow-x-auto">
            <div className="flex min-w-full">
              {hours.map((hour, idx) => {
                // Convert EST hour to Rome time for display
                const hourRome = hour.clone().tz('Europe/Rome')
                return (
                  <div
                    key={idx}
                    className="flex-1 border-r border-gray-200 text-center p-2 text-base text-gray-600"
                  >
                    <div className="font-medium text-base">{hour.format('HH:mm')}</div>
                    <div className="text-sm text-gray-400 mt-0.5">
                      {hourRome.format('HH:mm')}
                    </div>
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
        className="flex-1 overflow-y-auto overflow-x-auto bg-white" 
        style={{ 
          minHeight: 0,
          height: 0
        }}
        key={`scrollable-${groups.length}-${selectedDate}`}
      >
        <div className="min-w-full">
          {groups.map((group, groupIdx) => {
            // Check if this group has any blocks (CBC timeline) vs events (OBS timeline)
            const hasBlocks = itemsByGroup[group]?.some(item => item.block) || false
            const rowMinHeight = hasBlocks ? '200px' : '80px'
            
            return (
            <div
              key={group}
              className={`flex border-b border-gray-100 ${
                groupIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
              style={{ minHeight: rowMinHeight }}
            >
              {/* Group label */}
              <div className="w-32 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex items-center justify-center">
                <div className="font-semibold text-gray-800 text-sm">{group}</div>
              </div>

              {/* Timeline area */}
              <div className="flex-1 relative" style={{ minHeight: rowMinHeight }}>
                {/* Hour markers */}
                <div className="absolute inset-0 flex">
                  {hours.map((_, idx) => (
                    <div
                      key={idx}
                      className="flex-1 border-r border-gray-100"
                    />
                  ))}
                </div>

                {/* Events */}
                {itemsByGroup[group]?.filter(event => !event.isEmpty).map((event, eventIdx) => {
                  // Clamp to visible day (0-100%)
                  const leftPercent = Math.max(0, Math.min(100, event.startPercent))
                  const rightPercent = Math.max(0, Math.min(100, event.startPercent + event.widthPercent))
                  const left = `${leftPercent}%`
                  const width = `${Math.max(rightPercent - leftPercent, 2)}%` // Minimum 2% width
                  
                  const isBlock = event.block
                  const block = event.block || {}
                  
                  // Use yellow for 0-duration events, blue for normal events, green for blocks
                  const backgroundColor = event.isZeroDuration ? '#eab308' : (isBlock ? '#10b981' : '#3b82f6')
                  const borderColor = event.isZeroDuration ? '#ca8a04' : (isBlock ? '#059669' : '#2563eb')
                  
                  // Format times for display - explicitly parse as UTC first, then convert to EST
                  const startEST = moment.utc(event.start_time).tz('America/New_York')
                  const endEST = moment.utc(event.end_time).tz('America/New_York')
                  const startRome = moment.utc(event.start_time).tz('Europe/Rome')
                  const endRome = moment.utc(event.end_time).tz('Europe/Rome')
                  
                  const broadcastStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time).tz('America/New_York') : null
                  const broadcastEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time).tz('America/New_York') : null
                  
                  return (
                    <div
                      key={`${event.id}-${eventIdx}`}
                      onClick={() => handleItemClick(event)}
                      className="absolute top-2 bottom-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer group"
                      style={{
                        left,
                        width,
                        minWidth: isBlock ? '200px' : '120px',
                        backgroundColor,
                        border: `2px solid ${borderColor}`,
                        zIndex: 10,
                        height: isBlock ? 'auto' : undefined,
                        minHeight: isBlock ? 'auto' : undefined
                      }}
                      title={event.title}
                    >
                      {isBlock ? (
                        // Block display with metadata - matching the provided format
                        <div className="flex flex-col text-white p-2 text-[14.6px] leading-tight" style={{ minHeight: '100%' }}>
                          {/* Broadcast times in parentheses (first line) */}
                          {broadcastStart && broadcastEnd && (
                            <div className="text-[13.3px] opacity-90 mb-0.5">
                              ({broadcastStart.format('HH:mm')} - {broadcastEnd.format('HH:mm')})
                            </div>
                          )}
                          
                          {/* Actual event times (second line) */}
                          <div className="text-[13.3px] opacity-90 mb-1">
                            {startEST.format('HH:mm')} - {endEST.format('HH:mm')}
                          </div>
                          
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
                          
                          {/* Networks and Booths - one per line: "CBC TV : VT 52" format */}
                          {/* Always show the three network labels if we have any booths */}
                          {(() => {
                            // Define the three network labels in order (with proper capitalization)
                            const networkLabels = ['CBC TV', 'CBC Gem', 'R-C TV/WEB']
                            const displayLabels = ['CBC TV', 'CBC Gem', 'R-C TV/Web'] // Display labels
                            const displayItems = []
                            
                            // If we have booths, always show the three network labels
                            if (block.booths && block.booths.length > 0) {
                              // For each network label, find matching booth by index
                              networkLabels.forEach((networkLabel, labelIdx) => {
                                // Match booths to network labels by index (first booth = CBC TV, second = CBC Gem, third = R-C TV/Web)
                                const booth = block.booths[labelIdx] || null
                                
                                // Always show the network label if we have a booth for it
                                if (booth) {
                                  displayItems.push({ 
                                    networkName: displayLabels[labelIdx], 
                                    boothName: booth.name 
                                  })
                                }
                              })
                            }
                            
                            // Also check for networks that exist in the database (in case they're stored differently)
                            if (block.networks && block.networks.length > 0) {
                              block.networks.forEach((network, idx) => {
                                // Find the display label that matches this network
                                const networkLabelIndex = networkLabels.findIndex(nl => nl === network.name)
                                const displayLabel = networkLabelIndex >= 0 ? displayLabels[networkLabelIndex] : network.name
                                
                                // Find matching booth
                                const booth = block.booths && block.booths[idx] ? block.booths[idx] : null
                                
                                // Only add if not already in displayItems
                                if (!displayItems.find(item => item.networkName === displayLabel && item.boothName === booth?.name)) {
                                  displayItems.push({ 
                                    networkName: displayLabel, 
                                    boothName: booth?.name || null 
                                  })
                                }
                              })
                            }
                            
                            return displayItems.length > 0 ? (
                              <div className="mt-auto space-y-0.5 mb-1">
                                {displayItems.map((item, idx) => (
                                  <div key={idx} className="text-[13.3px] opacity-90">
                                    {item.networkName}{item.boothName ? ` : ${item.boothName}` : ''}
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
                          {/* Time label overlay - show both EST and Rome time, constrained to bottom, full width */}
                          <div className="bg-black bg-opacity-30 text-white text-[9px] px-1 py-0.5 rounded-b-lg flex-shrink-0 w-full">
                            <div className="flex justify-between items-center gap-1">
                              <span className="truncate">
                                EST: {startEST.format('HH:mm')}-{endEST.format('HH:mm')}
                              </span>
                              <span className="text-gray-300 truncate">
                                Rome: {startRome.format('HH:mm')}-{endRome.format('HH:mm')}
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
