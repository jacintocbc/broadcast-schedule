import { useState, useEffect } from 'react'
import moment from 'moment-timezone'

function formatMilanForInput(isoUtc) {
  if (!isoUtc) return ''
  return moment.utc(isoUtc).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
}

function milanInputToIso(value) {
  if (!value) return null
  return moment.tz(value, 'Europe/Rome').utc().toISOString()
}

function getInitialProducerStart(block, override) {
  const raw = override?.producer_broadcast_start_time ?? block?.broadcast_start_time ?? block?.start_time
  return formatMilanForInput(raw)
}
function getInitialProducerEnd(block, override) {
  const raw = override?.producer_broadcast_end_time ?? block?.broadcast_end_time ?? block?.end_time
  return formatMilanForInput(raw)
}

export default function PlanningBlockPanel({ block, override, onClose, onSave, onRemoveFromOnAir }) {
  const [notes, setNotes] = useState(override?.notes ?? '')
  const [producerStart, setProducerStart] = useState(() => getInitialProducerStart(block, override))
  const [producerEnd, setProducerEnd] = useState(() => getInitialProducerEnd(block, override))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setNotes(override?.notes ?? '')
    setProducerStart(getInitialProducerStart(block, override))
    setProducerEnd(getInitialProducerEnd(block, override))
  }, [block?.id, override])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const nextOverride = {
        ...override,
        notes: notes.trim() || undefined,
        producer_broadcast_start_time: milanInputToIso(producerStart) || undefined,
        producer_broadcast_end_time: milanInputToIso(producerEnd) || undefined
      }
      await onSave(block.id, nextOverride)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!block) return null

  const title = block?.name || block?.title || 'Block'

  return (
    <div className="p-4 flex flex-col h-full min-h-0" data-theme="dark">
      <div className="flex justify-between items-start mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white truncate pr-2">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-gray-500"
            placeholder="Producer notes…"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Producer Broadcast Start (Milan)</label>
          <input
            type="datetime-local"
            value={producerStart}
            onChange={(e) => setProducerStart(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Producer Broadcast End (Milan)</label>
          <input
            type="datetime-local"
            value={producerEnd}
            onChange={(e) => setProducerEnd(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-200 text-sm mt-2 flex-shrink-0">{error}</p>
      )}

      <div className="mt-4 flex flex-col gap-2 flex-shrink-0">
        <div className="flex gap-2 w-full">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 w-1/2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-600 text-gray-200 rounded hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
        {onRemoveFromOnAir && (
          <button
            type="button"
            onClick={() => { onRemoveFromOnAir(block.id); onClose() }}
            className="px-4 py-2 bg-gray-600 text-red-200 rounded hover:bg-gray-500 text-sm"
          >
            Remove from On Air
          </button>
        )}
      </div>
    </div>
  )
}
