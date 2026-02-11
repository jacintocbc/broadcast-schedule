import { useState, useEffect, useCallback, useMemo } from 'react'
import moment from 'moment-timezone'
import SchedulingGrid from './SchedulingGrid'
import ScheduleBlockDialog from './ScheduleBlockDialog'
import { getScheduleBlocks, getScheduleVenues, getResources } from '../utils/api'

const DEFAULT_DATE = moment().tz('Europe/Rome').format('YYYY-MM-DD')

function SchedulingView() {
  const [selectedDate, setSelectedDate] = useState(DEFAULT_DATE)
  const [blocks, setBlocks] = useState([])
  const [venues, setVenues] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dialogMode, setDialogMode] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editingBlock, setEditingBlock] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => moment.tz('America/New_York'))

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(moment.tz('America/New_York')), 1000)
    return () => clearInterval(interval)
  }, [])

  const times = useMemo(() => {
    const et = currentTime.clone().tz('America/New_York')
    const cet = currentTime.clone().tz('Europe/Rome')
    return { et: et.format('HH:mm:ss'), cet: cet.format('HH:mm:ss') }
  }, [currentTime])

  const loadBlocks = useCallback(async () => {
    if (!selectedDate) return
    try {
      setError(null)
      const data = await getScheduleBlocks(selectedDate)
      setBlocks(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setBlocks([])
    }
  }, [selectedDate])

  const loadVenues = useCallback(async () => {
    try {
      const data = await getScheduleVenues()
      setVenues(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load venues:', err)
      setVenues([])
    }
  }, [])

  const loadStaff = useCallback(async () => {
    try {
      const data = await getResources('staff')
      setStaff(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load staff:', err)
      setStaff([])
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadVenues()
    loadStaff()
  }, [loadVenues, loadStaff])

  useEffect(() => {
    setLoading(true)
    loadBlocks().finally(() => setLoading(false))
  }, [loadBlocks])

  const handleNewBlockDraft = (draftData) => {
    setDraft(draftData)
    setEditingBlock(null)
    setDialogMode('create')
  }

  const handleBlockClick = (block) => {
    setEditingBlock(block)
    setDraft(null)
    setDialogMode('edit')
  }

  const handleDialogClose = () => {
    setDialogMode(null)
    setDraft(null)
    setEditingBlock(null)
  }

  const handleDialogSuccess = () => {
    loadBlocks()
  }

  const dayLabel = selectedDate
    ? `${moment(selectedDate).format('dddd, MMMM D, YYYY')} - DAY ${String(moment(selectedDate).diff(moment('2026-02-06'), 'days') + 1).padStart(2, '0')}`
    : ''

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Top bar: date, title, clocks */}
      <div className="flex-none flex flex-wrap items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1 rounded border border-gray-600 bg-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
          />
          <p className="text-base font-semibold text-white">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-mono text-white">{times.cet} CET</div>
          <div className="text-sm font-mono text-white">{times.et} <span className="font-bold">ET</span></div>
          <p className="text-xs text-gray-400 hidden lg:block">
            Drag in a venue row to create a block
          </p>
        </div>
      </div>

      {error && (
        <div className="flex-none mx-4 mt-2 p-2 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
          {error}
        </div>
      )}

      {/* Grid fills remaining space */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">Loading…</div>
        ) : venues.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <p className="mb-2">No venues loaded.</p>
            <p className="text-sm">Run the <code className="bg-gray-800 px-1 rounded">supabase-scheduling.sql</code> migration in your Supabase SQL editor to create schedule tables and seed venues.</p>
          </div>
        ) : (
          <SchedulingGrid
            scheduleDate={selectedDate}
            venues={venues}
            blocks={blocks}
            onBlockClick={handleBlockClick}
            onNewBlockDraft={handleNewBlockDraft}
          />
        )}
      </div>
      {dialogMode && (
        <ScheduleBlockDialog
          mode={dialogMode}
          draft={draft}
          block={editingBlock}
          venues={venues}
          staff={staff}
          scheduleDate={selectedDate}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      )}
    </div>
  )
}

export default SchedulingView
