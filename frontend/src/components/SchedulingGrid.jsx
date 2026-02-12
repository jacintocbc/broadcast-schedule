import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import moment from 'moment-timezone'

const TZ_CET = 'Europe/Rome'
const TZ_ET = 'America/New_York'
const SLOT_MINUTES = 15
const START_HOUR = 7   // Grid starts at 07:00 CET
const END_HOUR = 27    // Grid ends at 03:00 CET next day (7 + 20 = 27)
const DISPLAY_HOURS = END_HOUR - START_HOUR // 20 hours shown
const SLOTS_PER_DAY = (DISPLAY_HOURS * 60) / SLOT_MINUTES // 80
const TIME_HEADER_HEIGHT = 28
const VENUE_COL_WIDTH = 100
const BLOCK_MIN_WIDTH = 100
const DEFAULT_ROW_HEIGHT = 60

/** Grid origin: 07:00 CET on the selected date */
function getDayStart(dateStr) {
  return moment.tz(`${dateStr}T00:00:00`, TZ_CET).add(START_HOUR, 'hours')
}

function timeToSlot(utcIso, dateStr) {
  const gridStart = getDayStart(dateStr)
  const gridEnd = gridStart.clone().add(DISPLAY_HOURS, 'hours')
  const m = moment.utc(utcIso).tz(TZ_CET)
  if (m.isBefore(gridStart) || m.isAfter(gridEnd)) return null
  const minutesFromStart = m.diff(gridStart, 'minutes')
  const slot = Math.floor(minutesFromStart / SLOT_MINUTES)
  return Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot))
}

function slotToTime(slotIndex, dateStr) {
  const gridStart = getDayStart(dateStr)
  return gridStart.clone().add(slotIndex * SLOT_MINUTES, 'minutes').utc().toISOString()
}

function fmt4(m) {
  return m.format('HHmm')
}

function formatTimeCET(m) {
  return m.tz(TZ_CET).format('HH:mm')
}
function formatTimeET(m) {
  return m.tz(TZ_ET).format('HH:mm')
}

const ACRONYMS = new Set(['HKY', 'RC', 'CBC', 'MH1', 'MH2', 'MSK', 'MSS', 'CCU', 'MCH', 'LCH', 'ALL'])

/** Format a key part for display - acronyms stay ALL CAPS, words get title case */
function formatVenuePart(s) {
  if (!s) return ''
  const upper = s.toUpperCase()
  if (ACRONYMS.has(upper)) return upper
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Get venue label pieces for display - each piece on its own line.
 * Keeps phrases like "Duomo - Live", "Duomo - Studio", "David - Live" together.
 */
function getVenueLabelPieces(venue) {
  const label = venue.label || venue.key || ''
  const key = venue.key || ''

  if (key) {
    const parts = key.split('_').filter(Boolean)
    const pieces = []
    let i = 0
    while (i < parts.length) {
      const p = parts[i].toUpperCase()
      const next = parts[i + 1]?.toUpperCase()
      const next2 = parts[i + 2]?.toUpperCase()
      if (p === 'FIG' && next === 'SKATE' && next2 === 'STRACK') {
        pieces.push('Fig/Skate/S.Track')
        i += 3
      } else if (p === 'LONG' && next === 'TRACK') {
        pieces.push('Long Track')
        i += 2
      } else if ((p === 'DUOMO' || p === 'DAVID') && (next === 'LIVE' || next === 'STUDIO')) {
        pieces.push(`${formatVenuePart(parts[i])} - ${formatVenuePart(parts[i + 1])}`)
        i += 2
      } else if (i > 0 && /^\d+$/.test(parts[i]) && pieces.length > 0) {
        pieces[pieces.length - 1] += ' ' + parts[i]
        i += 1
      } else {
        pieces.push(formatVenuePart(parts[i]))
        i += 1
      }
    }
    return pieces
  }

  // Fallback: split label by space; merge [A, "-", B] -> "A - B"; "Long" + "Track" -> "Long Track"
  const raw = label.replace(/_/g, ' ').split(/\s+/).filter(Boolean)
  const pieces = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '-' && i > 0 && i < raw.length - 1 && pieces.length > 0) {
      pieces[pieces.length - 1] += ' - ' + formatVenuePart(raw[i + 1])
      i += 1
    } else if (raw[i].toLowerCase() === 'long' && raw[i + 1]?.toLowerCase() === 'track') {
      pieces.push('Long Track')
      i += 1
    } else if (i > 0 && /^\d+$/.test(raw[i]) && pieces.length > 0) {
      pieces[pieces.length - 1] += ' ' + raw[i]
    } else {
      pieces.push(formatVenuePart(raw[i]))
    }
  }
  return pieces
}

/** Height needed for venue label (so text is not cut off) */
function measureVenueLabelHeight(venue) {
  const LINE = 15
  const pieces = getVenueLabelPieces(venue)
  return 16 + pieces.length * LINE
}

/** Estimate the height needed for a block's content */
function measureBlockContent(block, staffExpanded) {
  const LINE = 15
  let h = 8 // padding top/bottom

  // Title - multi-line (count newline-separated lines)
  const titleLines = Math.max(1, (block.title || '').split(/\r?\n/).length)
  h += titleLines * LINE

  h += LINE // CET time
  h += LINE // ET time

  // Resource flags - only when at least one is true (skip for simple blocks)
  const resourceFlags = ['field_crew', 'panel_tech', 'panel_talent', 'unicamx1', 'unicamx2']
  const hasAnyResource = resourceFlags.some((f) => block[f] === true)
  if (hasAnyResource) {
    h += 6 // gap
    resourceFlags.forEach((f) => {
      h += LINE
    })
  }

  // Staff section
  const staffList = block.staff || []
  if (staffList.length > 0) {
    h += 6 // gap
    h += LINE // "Staff:" header / toggle
    if (staffExpanded) {
      h += staffList.length * LINE
    }
  }

  // Notes
  if (block.notes) {
    h += 6 // gap
    const noteLines = Math.max(1, Math.max((block.notes || '').split(/\r?\n/).length, Math.ceil((block.notes || '').length / 30)))
    h += noteLines * LINE
  }

  return Math.max(h, 50)
}

/* ─── Block Content Component ─── */
function BlockContent({ block, staffExpanded, onToggleStaff }) {
  const startCET = moment.utc(block.start_time).tz(TZ_CET)
  const endCET = moment.utc(block.end_time).tz(TZ_CET)
  const startET = moment.utc(block.start_time).tz(TZ_ET)
  const endET = moment.utc(block.end_time).tz(TZ_ET)
  const staffList = block.staff || []

  const resourceFlags = [
    { key: 'field_crew', label: 'Field Crew' },
    { key: 'panel_tech', label: 'Panel Tech' },
    { key: 'panel_talent', label: 'Panel Talent' },
    { key: 'unicamx1', label: 'UniCamx1' },
    { key: 'unicamx2', label: 'UniCamx2' }
  ]

  const hasAnyResource = resourceFlags.some(({ key }) => block[key] === true)

  return (
    <>
      {/* Title - multi-line with whitespace-pre-wrap */}
      <div className="font-bold text-white text-[11px] leading-tight whitespace-pre-wrap">
        {block.title?.trim() || 'Untitled'}
      </div>

      {/* Notes - additional description shown prominently below title */}
      {block.notes && (
        <div className="mt-0.5 text-[10px] leading-tight text-gray-400 whitespace-pre-wrap">
          {block.notes}
        </div>
      )}

      {/* Times - 4-digit format like reference */}
      <div className="text-[11px] leading-tight mt-0.5">
        <span className="text-gray-200">{fmt4(startCET)}-{fmt4(endCET)}ct</span>
      </div>
      <div className="text-[11px] leading-tight">
        <span className="text-gray-400">{fmt4(startET)}-{fmt4(endET)}et</span>
      </div>

      {/* Resource flags - only when at least one is YES (omit for simple blocks) */}
      {hasAnyResource && (
        <div className="mt-1 space-y-0">
          {resourceFlags.map(({ key, label }) => {
            const val = block[key]
            return (
              <div key={key} className="text-[10px] leading-tight">
                <span className="text-gray-300">{label} - </span>
                <span className={val ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {val ? 'YES' : 'NO'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Staff section - collapsible */}
      {staffList.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            className="text-[10px] leading-tight font-semibold text-blue-300 hover:text-blue-200 flex items-center gap-0.5"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStaff(block.id)
            }}
          >
            <span className="inline-block transition-transform" style={{ transform: staffExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              &#9654;
            </span>
            <span>Staff ({staffList.length})</span>
          </button>
          {staffExpanded && (
            <div className="ml-2 mt-0.5">
              {staffList.map((s) => (
                <div key={s.id} className="text-[10px] leading-tight text-gray-300">
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ─── Main Grid ─── */
function SchedulingGrid({ scheduleDate, venues, blocks, onBlockClick, onNewBlockDraft }) {
  const [drag, setDrag] = useState(null)
  const gridRef = useRef(null)
  const dragRectRef = useRef(null)
  const [timeAreaWidth, setTimeAreaWidth] = useState(960)
  const [expandedStaff, setExpandedStaff] = useState({}) // { blockId: true }

  const toggleStaffExpanded = useCallback((blockId) => {
    setExpandedStaff((prev) => ({ ...prev, [blockId]: !prev[blockId] }))
  }, [])

  const dayStart = getDayStart(scheduleDate)
  const venueList = venues || []
  const hourWidth = timeAreaWidth / DISPLAY_HOURS
  const slotWidth = hourWidth / 4

  const blockPositions = useMemo(() => (blocks || []).map((b) => {
    const startSlot = timeToSlot(b.start_time, scheduleDate)
    const endSlot = timeToSlot(b.end_time, scheduleDate)
    // Skip blocks entirely outside the visible window
    if (startSlot == null && endSlot == null) return null
    const start = startSlot != null ? startSlot : 0
    let end = endSlot != null ? endSlot : SLOTS_PER_DAY
    if (end <= start) end = start + 1
    return {
      block: b,
      startSlot: start,
      endSlot: Math.min(end, SLOTS_PER_DAY),
      venueIndex: venueList.findIndex((v) => v.id === b.venue_id)
    }
  }).filter((p) => p && p.venueIndex >= 0), [blocks, scheduleDate, venueList])

  // Compute per-venue row height: max of default, block content, and venue label height (so no text is cut off)
  const venueRowHeights = useMemo(() => {
    const heights = venueList.map((v, i) => {
      const labelH = measureVenueLabelHeight(v)
      return Math.max(DEFAULT_ROW_HEIGHT, labelH)
    })
    blockPositions.forEach(({ block, venueIndex }) => {
      const needed = measureBlockContent(block, !!expandedStaff[block.id])
      if (needed + 6 > heights[venueIndex]) heights[venueIndex] = needed + 6
    })
    return heights
  }, [venueList, blockPositions, expandedStaff])

  // Cumulative Y offset for each venue row
  const venueRowTops = useMemo(() => {
    const tops = []
    let y = 0
    venueRowHeights.forEach((h) => {
      tops.push(y)
      y += h
    })
    return tops
  }, [venueRowHeights])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const updateWidth = () => {
      const w = el.offsetWidth
      if (w > VENUE_COL_WIDTH) {
        setTimeAreaWidth(w - VENUE_COL_WIDTH)
      }
    }
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!drag) return
    const handleMove = (e) => {
      if (!dragRectRef.current) return
      const rect = dragRectRef.current
      const x = e.clientX - rect.left - VENUE_COL_WIDTH
      const slot = Math.floor(x / slotWidth)
      const clampedSlot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot))
      setDrag((prev) => (prev ? { ...prev, endSlot: clampedSlot } : null))
    }
    const handleUp = () => {
      if (!drag) {
        setDrag(null)
        return
      }
      const startSlot = Math.min(drag.startSlot, drag.endSlot)
      const endSlot = Math.max(drag.startSlot, drag.endSlot)
      const durationSlots = endSlot - startSlot
      const effectiveEnd = durationSlots < 2 ? startSlot + 2 : endSlot
      const startTime = slotToTime(startSlot, scheduleDate)
      const endTime = slotToTime(Math.min(effectiveEnd, SLOTS_PER_DAY), scheduleDate)
      const venue = venueList[drag.venueIndex]
      if (venue && new Date(startTime) < new Date(endTime)) {
        onNewBlockDraft({ startTime, endTime, venueId: venue.id })
      }
      setDrag(null)
      dragRectRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [drag, scheduleDate, venueList, onNewBlockDraft, slotWidth])

  const totalHeaderHeight = TIME_HEADER_HEIGHT * 2
  const bodyHeight = venueRowHeights.reduce((s, h) => s + h, 0)

  const handleLaneMouseDown = (e, venueIndex) => {
    if (!onNewBlockDraft || e.button !== 0) return
    const laneRect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - laneRect.left
    const slot = Math.floor(x / slotWidth)
    const clampedSlot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot))
    if (gridRef.current) dragRectRef.current = gridRef.current.getBoundingClientRect()
    setDrag({ venueIndex, startSlot: clampedSlot, endSlot: clampedSlot })
  }

  return (
    <div
      className="relative w-full bg-gray-900"
      ref={gridRef}
      style={{ minHeight: totalHeaderHeight + bodyHeight }}
    >
      {/* Sticky header: CET + ET rows */}
      <div
        className="sticky top-0 z-30 grid border-b border-gray-600"
        style={{
          gridTemplateColumns: `${VENUE_COL_WIDTH}px repeat(${DISPLAY_HOURS}, minmax(0, 1fr))`,
          gridTemplateRows: `${TIME_HEADER_HEIGHT}px ${TIME_HEADER_HEIGHT}px`,
          width: '100%'
        }}
      >
        <div className="bg-gray-800 text-gray-400 text-xs font-semibold flex items-center justify-center border-b border-r border-gray-600" style={{ gridColumn: 1, gridRow: 1 }}>
          Milan (CET)
        </div>
        {Array.from({ length: DISPLAY_HOURS }, (_, h) => (
          <div
            key={`cet-${h}`}
            className="bg-gray-800 text-gray-300 text-sm font-medium flex items-center justify-center border-b border-r border-gray-600"
            style={{ gridColumn: h + 2, gridRow: 1 }}
          >
            {formatTimeCET(dayStart.clone().add(h, 'hours'))}
          </div>
        ))}
        <div className="bg-gray-800 text-gray-400 text-xs font-semibold flex items-center justify-center border-b border-r border-gray-600" style={{ gridColumn: 1, gridRow: 2 }}>
          ET
        </div>
        {Array.from({ length: DISPLAY_HOURS }, (_, h) => (
          <div
            key={`et-${h}`}
            className="bg-gray-800 text-gray-500 text-sm flex items-center justify-center border-b border-r border-gray-600"
            style={{ gridColumn: h + 2, gridRow: 2 }}
          >
            {formatTimeET(dayStart.clone().add(h, 'hours'))}
          </div>
        ))}
      </div>

      {/* Body: venue rows + blocks */}
      <div className="relative" style={{ minHeight: bodyHeight }}>
        {/* Venue row backgrounds + lanes */}
        {venueList.map((v, rowIndex) => {
          const rowH = venueRowHeights[rowIndex]
          const rowTop = venueRowTops[rowIndex]
          return (
            <div key={v.id} className="absolute w-full flex" style={{ top: rowTop, height: rowH }}>
              {/* Venue name - each piece on its own line; phrases like "Duomo - Live" stay together */}
              <div
                className="bg-gray-800 text-gray-200 text-[11px] font-medium flex flex-col items-start pt-2 pl-2 pr-1 border-b border-r border-gray-600 flex-shrink-0 leading-tight gap-0"
                style={{ width: VENUE_COL_WIDTH }}
              >
                {getVenueLabelPieces(v).map((piece, i) => (
                  <span key={i} className="break-words">{piece}</span>
                ))}
              </div>
              {/* Lane for drag-to-create */}
              <div
                className="flex-1 bg-gray-900 hover:bg-gray-800/80 cursor-crosshair border-b border-gray-600 relative"
                onMouseDown={(e) => handleLaneMouseDown(e, rowIndex)}
              />
            </div>
          )
        })}

        {/* Blocks */}
        {blockPositions.map(({ block, startSlot, endSlot, venueIndex }) => {
          const rawW = ((endSlot - startSlot) / 4) * hourWidth - 4
          const w = Math.max(BLOCK_MIN_WIDTH, rawW)
          const rowH = venueRowHeights[venueIndex]
          const rowTop = venueRowTops[venueIndex]
          const isStaffExpanded = !!expandedStaff[block.id]

          return (
            <div
              key={block.id}
              className="absolute border border-gray-500/80 bg-gray-700 text-gray-100 cursor-pointer hover:bg-gray-600 hover:border-gray-400 p-1.5 shadow-md z-10 overflow-hidden"
              style={{
                left: VENUE_COL_WIDTH + (startSlot / 4) * hourWidth + 2,
                width: w,
                minWidth: BLOCK_MIN_WIDTH,
                top: rowTop + 2,
                height: rowH - 4
              }}
              onClick={(e) => {
                e.stopPropagation()
                onBlockClick?.(block)
              }}
            >
              <BlockContent
                block={block}
                staffExpanded={isStaffExpanded}
                onToggleStaff={toggleStaffExpanded}
              />
            </div>
          )
        })}

        {/* Drag preview */}
        {drag != null && (() => {
          const rowTop = venueRowTops[drag.venueIndex] || 0
          const rowH = venueRowHeights[drag.venueIndex] || DEFAULT_ROW_HEIGHT
          return (
            <div
              className="pointer-events-none rounded border-2 border-dashed border-gray-400 bg-gray-500/30 z-20 absolute shadow"
              style={{
                left: VENUE_COL_WIDTH + (Math.min(drag.startSlot, drag.endSlot) / 4) * hourWidth + 2,
                width: Math.max(BLOCK_MIN_WIDTH, ((Math.abs(drag.endSlot - drag.startSlot) + 1) / 4) * hourWidth - 4),
                top: rowTop + 2,
                height: rowH - 4
              }}
            />
          )
        })()}
      </div>
    </div>
  )
}

export default SchedulingGrid
