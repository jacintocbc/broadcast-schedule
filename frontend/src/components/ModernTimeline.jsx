import { useMemo, useRef, useEffect, useState } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { getBlockTypeColor, darkenColor } from '../utils/blockTypes'

function ModernTimeline({ events, selectedDate, onItemSelect, onItemDoubleClick, datePickerHeight = 0, navbarHeight = 73, zoomHours = 24, scrollPosition = 0 }) {
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const scrollableRef = useRef(null)
  const [availableHeight, setAvailableHeight] = useState(null)
  // Calculate selectedDayStart outside useMemo so it's available in render
  const selectedDayStart = useMemo(() => {
    return selectedDate 
      ? moment.tz(selectedDate, 'America/New_York').startOf('day')
      : moment.tz('America/New_York').startOf('day')
  }, [selectedDate])

  const { hours, groups, itemsByGroup } = useMemo(() => {
    if (!events || events.length === 0) {
      return { hours: [], groups: [], itemsByGroup: {} }
    }

    // Generate hours based on zoom level
    // For zoomed views, generate hours for the visible range
    // For 24h view, show all 24 hours
    const totalHours = zoomHours === 24 ? 24 : zoomHours
    const startHour = zoomHours === 24 ? 0 : scrollPosition
    const hours = Array.from({ length: totalHours }, (_, i) => 
      selectedDayStart.clone().add(startHour + i, 'hours')
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
          
          // Convert to percentage of visible time range (not full day for zoomed views)
          const visibleStartMinutes = zoomHours === 24 ? 0 : scrollPosition * 60
          const visibleEndMinutes = zoomHours === 24 ? 24 * 60 : (scrollPosition + zoomHours) * 60
          const visibleRangeMinutes = visibleEndMinutes - visibleStartMinutes
          
          // Calculate position relative to visible range
          const startPercent = ((startMinutesFromDayStart - visibleStartMinutes) / visibleRangeMinutes) * 100
          const endPercent = ((endMinutesFromDayStart - visibleStartMinutes) / visibleRangeMinutes) * 100
          
          // Calculate duration and width
          const durationMinutes = end.diff(start, 'minutes')
          // For 0-duration events, use minimum width based on zoom level
          const minDurationMinutes = durationMinutes === 0 
            ? Math.max(5, (zoomHours * 60) / 20) // Scale minimum width with zoom
            : durationMinutes
          const widthPercent = (minDurationMinutes / visibleRangeMinutes) * 100
          
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
          <div className={`flex-1 flex ${zoomHours < 24 ? 'overflow-x-auto' : ''}`}>
            <div className="flex w-full">
              {hours.map((hour, idx) => {
                // Convert EST hour to Rome time for display
                const hourRome = hour.clone().tz('Europe/Rome')
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-200 text-center p-2 text-base text-gray-600"
                    style={{ 
                      width: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                      minWidth: zoomHours < 24 ? `${100 / zoomHours}%` : `${100 / hours.length}%`,
                      flexShrink: 0
                    }}
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
            const rowMinHeight = hasBlocks ? '200px' : '80px'
            
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
              <div className="w-32 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center">
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
                  // Filter events that are outside the visible range
                  if (zoomHours < 24) {
                    const visibleStartMinutes = scrollPosition * 60
                    const visibleEndMinutes = (scrollPosition + zoomHours) * 60
                    const eventStartMinutes = event.startEST.diff(selectedDayStart, 'minutes')
                    const eventEndMinutes = event.endEST.diff(selectedDayStart, 'minutes')
                    // Show event if it overlaps with visible range
                    return eventEndMinutes >= visibleStartMinutes && eventStartMinutes <= visibleEndMinutes
                  }
                  return true
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
                  
                  // Use yellow for 0-duration events, blue for normal events, type-based color for blocks
                  let backgroundColor
                  let borderColor
                  let textColor = 'text-white' // Default to white text
                  
                  if (event.isZeroDuration) {
                    backgroundColor = '#eab308'
                    borderColor = '#ca8a04'
                  } else if (isBlock) {
                    // Get color from block type, or use default green
                    backgroundColor = getBlockTypeColor(block.type)
                    // Use a darker version of the background color for the border
                    borderColor = darkenColor(backgroundColor, 30)
                    
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
                  }
                  
                  // Format times for display - explicitly parse as UTC first, then convert to EST
                  const startEST = moment.utc(event.start_time).tz('America/New_York')
                  const endEST = moment.utc(event.end_time).tz('America/New_York')
                  const startRome = moment.utc(event.start_time).tz('Europe/Rome')
                  const endRome = moment.utc(event.end_time).tz('Europe/Rome')
                  
                  const broadcastStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time).tz('America/New_York') : null
                  const broadcastEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time).tz('America/New_York') : null
                  
                  // Create a key that includes booth relationships for blocks to force re-render
                  const blockKey = isBlock && block.booths 
                    ? `${event.id}-${eventIdx}-${JSON.stringify(block.booths.map(b => ({ id: b.id, network_id: b.network_id, name: b.name })))}`
                    : `${event.id}-${eventIdx}`
                  
                  return (
                    <div
                      key={blockKey}
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
                        <div 
                          className={`flex flex-col p-2 text-[14.6px] leading-tight ${textColor} relative`}
                          style={{ minHeight: '100%' }}
                        >
                          {/* Canadian Content Maple Leaf - top right corner */}
                          {block.canadian_content && (
                            <div className="absolute top-2 right-2 text-red-600 text-lg leading-none" style={{ lineHeight: '1' }}>
                              🍁
                            </div>
                          )}
                          
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
