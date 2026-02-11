import { useState, useEffect } from 'react'
import moment from 'moment-timezone'
import {
  createScheduleBlock,
  updateScheduleBlock,
  deleteScheduleBlock
} from '../utils/api'

const TZ_CET = 'Europe/Rome'
const TZ_ET = 'America/New_York'

function formatForInput(iso) {
  if (!iso) return ''
  return moment.utc(iso).tz(TZ_CET).format('YYYY-MM-DDTHH:mm')
}

function ScheduleBlockDialog({ mode, draft, block, venues, staff, scheduleDate, onClose, onSuccess }) {
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit'

  const [title, setTitle] = useState('')
  const [startTimeLocal, setStartTimeLocal] = useState('')
  const [endTimeLocal, setEndTimeLocal] = useState('')
  const [venueId, setVenueId] = useState('')
  const [staffIds, setStaffIds] = useState([])
  const [fieldCrew, setFieldCrew] = useState(false)
  const [panelTech, setPanelTech] = useState(false)
  const [panelTalent, setPanelTalent] = useState(false)
  const [unicamx1, setUnicamx1] = useState(false)
  const [unicamx2, setUnicamx2] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isSimpleBlock, setIsSimpleBlock] = useState(true)

  useEffect(() => {
    if (isCreate && draft) {
      setTitle('')
      setStartTimeLocal(formatForInput(draft.startTime))
      setEndTimeLocal(formatForInput(draft.endTime))
      setVenueId(draft.venueId || '')
      setStaffIds([])
      setFieldCrew(false)
      setPanelTech(false)
      setPanelTalent(false)
      setUnicamx1(false)
      setUnicamx2(false)
      setNotes('')
      setConfirmDelete(false)
      setIsSimpleBlock(true)
    }
    if (isEdit && block) {
      setTitle(block.title || '')
      setStartTimeLocal(formatForInput(block.start_time))
      setEndTimeLocal(formatForInput(block.end_time))
      setVenueId(block.venue_id || '')
      setStaffIds((block.staff || []).map((s) => s.id))
      setFieldCrew(!!block.field_crew)
      setPanelTech(!!block.panel_tech)
      setPanelTalent(!!block.panel_talent)
      setUnicamx1(!!block.unicamx1)
      setUnicamx2(!!block.unicamx2)
      setNotes(block.notes || '')
      setConfirmDelete(false)
      const hasStaff = (block.staff || []).length > 0
      const hasAnyResource = !!(block.field_crew || block.panel_tech || block.panel_talent || block.unicamx1 || block.unicamx2)
      setIsSimpleBlock(!hasStaff && !hasAnyResource)
    }
  }, [mode, draft, block])

  const dateForSchedule = scheduleDate || (block && moment.utc(block.start_time).tz(TZ_CET).format('YYYY-MM-DD')) || moment.tz(TZ_CET).format('YYYY-MM-DD')

  const toggleStaff = (id) => {
    setStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toUtcIso = (localStr) => {
    if (!localStr) return null
    return moment.tz(localStr, TZ_CET).utc().toISOString()
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    const startTime = toUtcIso(startTimeLocal)
    const endTime = toUtcIso(endTimeLocal)
    if (!startTime || !endTime || new Date(startTime) >= new Date(endTime)) {
      setError('End time must be after start time.')
      return
    }
    if (!venueId) {
      setError('Please select a venue.')
      return
    }
    setLoading(true)
    try {
      await createScheduleBlock({
        schedule_date: dateForSchedule,
        venue_id: venueId,
        title: title.trim() || 'Untitled',
        start_time: startTime,
        end_time: endTime,
        field_crew: fieldCrew,
        panel_tech: panelTech,
        panel_talent: panelTalent,
        unicamx1,
        unicamx2,
        notes: notes.trim() || null,
        staff_ids: staffIds
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create block')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setError(null)
    const startTime = toUtcIso(startTimeLocal)
    const endTime = toUtcIso(endTimeLocal)
    if (!startTime || !endTime || new Date(startTime) >= new Date(endTime)) {
      setError('End time must be after start time.')
      return
    }
    if (!venueId) {
      setError('Please select a venue.')
      return
    }
    setLoading(true)
    try {
      await updateScheduleBlock(block.id, {
        schedule_date: dateForSchedule,
        venue_id: venueId,
        title: title.trim() || 'Untitled',
        start_time: startTime,
        end_time: endTime,
        field_crew: fieldCrew,
        panel_tech: panelTech,
        panel_talent: panelTalent,
        unicamx1,
        unicamx2,
        notes: notes.trim() || null,
        staff_ids: staffIds
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update block')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setError(null)
    setLoading(true)
    try {
      await deleteScheduleBlock(block.id)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete block')
    } finally {
      setLoading(false)
    }
  }

  if (!isCreate && !isEdit) return null

  const inputClass = 'w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white'
  const labelClass = 'block text-sm font-medium mb-1 text-gray-300'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-800 text-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-gray-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-600 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {isCreate ? 'New Schedule Block' : 'Edit Schedule Block'}
          </h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-white" title="Close">
            ×
          </button>
        </div>
        <form onSubmit={isCreate ? handleCreate : handleUpdate} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="p-3 rounded bg-red-900/30 border border-red-500 text-red-200 text-sm">
                {error}
              </div>
            )}
            <div>
              <span className={labelClass}>Block type</span>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="blockType"
                    checked={isSimpleBlock}
                    onChange={() => setIsSimpleBlock(true)}
                    className="rounded"
                  />
                  <span className="text-sm">Simple</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="blockType"
                    checked={!isSimpleBlock}
                    onChange={() => setIsSimpleBlock(false)}
                    className="rounded"
                  />
                  <span className="text-sm">Full (staff & resources)</span>
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass}>Title *</label>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                rows={3}
                placeholder="Event name or multi-line description"
              />
            </div>
            <div>
              <label className={labelClass}>Venue *</label>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select venue</option>
                {(venues || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label || v.key}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start (CET)</label>
                <input
                  type="datetime-local"
                  value={startTimeLocal}
                  onChange={(e) => setStartTimeLocal(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>End (CET)</label>
                <input
                  type="datetime-local"
                  value={endTimeLocal}
                  onChange={(e) => setEndTimeLocal(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            {!isSimpleBlock && (
              <>
                <div>
                  <label className={labelClass}>Staff</label>
                  <div className="flex flex-wrap gap-2 border border-gray-600 rounded-md bg-gray-700 p-2 max-h-32 overflow-y-auto">
                    {(staff || []).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staffIds.includes(s.id)}
                          onChange={() => toggleStaff(s.id)}
                          className="rounded"
                        />
                        <span className="text-sm">{s.name}</span>
                      </label>
                    ))}
                    {(!staff || staff.length === 0) && (
                      <span className="text-gray-500 text-sm">No staff in database. Add staff under Resources.</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className={labelClass}>Resources</span>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fieldCrew} onChange={(e) => setFieldCrew(e.target.checked)} className="rounded" />
                      <span className="text-sm">Field Crew</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={panelTech} onChange={(e) => setPanelTech(e.target.checked)} className="rounded" />
                      <span className="text-sm">Panel Tech</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={panelTalent} onChange={(e) => setPanelTalent(e.target.checked)} className="rounded" />
                      <span className="text-sm">Panel Talent</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={unicamx1} onChange={(e) => setUnicamx1(e.target.checked)} className="rounded" />
                      <span className="text-sm">UniCam x1</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={unicamx2} onChange={(e) => setUnicamx2(e.target.checked)} className="rounded" />
                      <span className="text-sm">UniCam x2</span>
                    </label>
                  </div>
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
                rows={2}
                placeholder="Optional notes"
              />
            </div>
            {isEdit && (
              <div className="pt-2 border-t border-gray-600">
                <button
                  type="button"
                  onClick={handleDelete}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    confirmDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-500 text-red-300'
                  }`}
                >
                  {confirmDelete ? 'Click again to confirm delete' : 'Delete block'}
                </button>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-600 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500">
              Cancel
            </button>
            {isCreate && (
              <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
                {loading ? 'Creating…' : 'Create'}
              </button>
            )}
            {isEdit && (
              <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
                {loading ? 'Saving…' : 'Update'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default ScheduleBlockDialog
