import { useState, useEffect } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { createBlock, addBlockRelationship } from '../utils/api'
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
  const [commentators, setCommentators] = useState([])
  const [booths, setBooths] = useState([])
  const [networks, setNetworks] = useState([])
  
  // Form state for commentators and booths
  const [commentatorSelections, setCommentatorSelections] = useState({
    pxp: '',
    color: '',
    spare: ''
  })
  const [boothSelections, setBoothSelections] = useState({
    cbcTv: '',
    cbcWeb: '',
    rcTvWeb: ''
  })
  
  // Network labels that correspond to booth selections (these are just labels, not actual network records)
  const networkLabels = {
    cbcTv: 'CBC TV',
    cbcWeb: 'CBC Gem',
    rcTvWeb: 'R-C TV/WEB'
  }

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
      const [encodersData, producersData, suitesData, commentatorsData, boothsData, networksData] = await Promise.all([
        getResources('encoders'),
        getResources('producers'),
        getResources('suites'),
        getResources('commentators'),
        getResources('booths'),
        getResources('networks')
      ])
      setEncoders(encodersData)
      setProducers(producersData)
      setSuites(suitesData)
      setCommentators(commentatorsData)
      setBooths(boothsData)
      setNetworks(networksData)
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
        source_event_id: event?.id || null,
        obs_group: event?.group || null // Store the DX channel from OBS event
      }

      const newBlock = await createBlock(blockData)
      
      // Add commentator relationships
      try {
        if (commentatorSelections.pxp) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.pxp, 'PxP')
        }
        if (commentatorSelections.color) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.color, 'Color')
        }
        if (commentatorSelections.spare) {
          await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.spare, 'Spare')
        }
        
        // Add booth relationships and corresponding network labels
        // When a booth is selected, we need to find or create the network with the matching label
        const addBoothWithNetwork = async (boothId, networkLabel) => {
          if (boothId) {
            await addBlockRelationship(newBlock.id, 'booths', boothId)
            // Find network by label name
            const network = networks.find(n => n.name === networkLabel)
            if (network) {
              await addBlockRelationship(newBlock.id, 'networks', network.id)
            }
          }
        }
        
        if (boothSelections.cbcTv) {
          await addBoothWithNetwork(boothSelections.cbcTv, networkLabels.cbcTv)
        }
        if (boothSelections.cbcWeb) {
          await addBoothWithNetwork(boothSelections.cbcWeb, networkLabels.cbcWeb)
        }
        if (boothSelections.rcTvWeb) {
          await addBoothWithNetwork(boothSelections.rcTvWeb, networkLabels.rcTvWeb)
        }
      } catch (relError) {
        // Block was created but relationships failed - log but don't fail the whole operation
        console.error('Error adding relationships:', relError)
        // Still show success since block was created
      }
      
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
      
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Event Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Event Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Times */}
          <div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time *</label>
                <input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time *</label>
                <input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast Start Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_start_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_start_time: e.target.value })}
                  min={formData.start_time ? (() => {
                    const startDate = formData.start_time.split('T')[0]
                    return `${startDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    if (!formData.broadcast_start_time && formData.start_time) {
                      const startMoment = moment.tz(formData.start_time, 'America/New_York')
                      const suggested = startMoment.clone().subtract(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_start_time: suggested }))
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast End Time</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_end_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_end_time: e.target.value })}
                  min={formData.end_time ? (() => {
                    const endDate = formData.end_time.split('T')[0]
                    return `${endDate}T00:00`
                  })() : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={(e) => {
                    if (!formData.broadcast_end_time && formData.end_time) {
                      const endMoment = moment.tz(formData.end_time, 'America/New_York')
                      const suggested = endMoment.clone().add(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_end_time: suggested }))
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Resources */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Resources</h3>
            <div className="space-y-3">
              {/* Encoder */}
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
              
              {/* Booths - networks are automatically added based on booth selection */}
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">CBC TV - Booth</label>
                  <select
                    value={boothSelections.cbcTv}
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcTv: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">CBC Gem - Booth</label>
                  <select
                    value={boothSelections.cbcWeb}
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcWeb: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">R-C TV/WEB - Booth</label>
                  <select
                    value={boothSelections.rcTvWeb}
                    onChange={(e) => setBoothSelections({ ...boothSelections, rcTvWeb: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {booths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Commentators */}
              <div>
                <label className="block text-sm font-medium mb-1">Commentators</label>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">PxP</label>
                    <select
                      value={commentatorSelections.pxp}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, pxp: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Color</label>
                    <select
                      value={commentatorSelections.color}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, color: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Spare</label>
                    <select
                      value={commentatorSelections.spare}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, spare: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      {commentators.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Producer */}
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
              
              {/* Suite */}
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
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add to CBC Timeline'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default AddToCBCForm
