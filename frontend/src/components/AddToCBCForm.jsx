import { useState, useEffect } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { createBlock } from '../utils/api'
import { getResources } from '../utils/api'

function AddToCBCForm({ event, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    obs_id: '',
    start_time: '',
    end_time: '',
    broadcast_start_time: '',
    broadcast_end_time: '',
    encoder_id: '',
    producer_id: '',
    suite_id: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [encoders, setEncoders] = useState([])
  const [producers, setProducers] = useState([])
  const [suites, setSuites] = useState([])

  useEffect(() => {
    if (event) {
      // Convert UTC times from event to EST for display in datetime-local inputs
      const formatTimeForInput = (utcTime) => {
        if (!utcTime) return ''
        // Parse as UTC and convert to EST
        return moment.utc(utcTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
      }
      
      // Pre-fill form with event data
      setFormData({
        name: event.title || '',
        obs_id: event.id || '',
        start_time: formatTimeForInput(event.start_time),
        end_time: formatTimeForInput(event.end_time),
        broadcast_start_time: '',
        broadcast_end_time: '',
        encoder_id: '',
        producer_id: '',
        suite_id: ''
      })
    }
    loadReferenceData()
  }, [event])

  const loadReferenceData = async () => {
    try {
      const [encodersData, producersData, suitesData] = await Promise.all([
        getResources('encoders'),
        getResources('producers'),
        getResources('suites')
      ])
      setEncoders(encodersData)
      setProducers(producersData)
      setSuites(suitesData)
    } catch (err) {
      console.error('Error loading reference data:', err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)

      if (!formData.name || !formData.start_time || !formData.end_time) {
        throw new Error('Name, start time, and end time are required')
      }

      // Convert datetime-local values (interpreted as EST) to UTC ISO strings
      const convertESTToUTC = (estDateTimeLocal) => {
        if (!estDateTimeLocal) return null
        // Parse the datetime-local value as EST and convert to UTC
        return moment.tz(estDateTimeLocal, 'America/New_York').utc().toISOString()
      }

      const blockData = {
        name: formData.name,
        obs_id: formData.obs_id || null,
        start_time: convertESTToUTC(formData.start_time),
        end_time: convertESTToUTC(formData.end_time),
        broadcast_start_time: convertESTToUTC(formData.broadcast_start_time),
        broadcast_end_time: convertESTToUTC(formData.broadcast_end_time),
        encoder_id: formData.encoder_id || null,
        producer_id: formData.producer_id || null,
        suite_id: formData.suite_id || null,
        source_event_id: event?.id || null
      }

      await createBlock(blockData)
      
      if (onSuccess) {
        onSuccess()
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add block to CBC timeline')
      console.error('Error creating block:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!event) {
    return null
  }

  return (
    <div className="h-full bg-white border-l border-gray-300 shadow-lg flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Add to CBC Timeline</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          title="Close"
        >
          ×
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Basic Information */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Basic Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">OBS ID</label>
                <input
                  type="text"
                  value={formData.obs_id}
                  onChange={(e) => setFormData({ ...formData, obs_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                  readOnly
                />
              </div>
            </div>
          </section>

          {/* Times */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Times</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time *</label>
                <input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time *</label>
                <input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast Start Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_start_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast End Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_end_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </section>

          {/* Resources */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Resources</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Encoder</label>
                <select
                  value={formData.encoder_id}
                  onChange={(e) => setFormData({ ...formData, encoder_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">None</option>
                  {encoders.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Producer</label>
                <select
                  value={formData.producer_id}
                  onChange={(e) => setFormData({ ...formData, producer_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">None</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Suite</label>
                <select
                  value={formData.suite_id}
                  onChange={(e) => setFormData({ ...formData, suite_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">None</option>
                  {suites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add to CBC Timeline'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddToCBCForm
