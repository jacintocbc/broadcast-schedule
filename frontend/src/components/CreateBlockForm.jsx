import { useState, useEffect, useMemo } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { createBlock, addBlockRelationship, getBlocks, getResources } from '../utils/api'
import { BLOCK_TYPES } from '../utils/blockTypes'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function CreateBlockForm({ draft, selectedDate, encoders, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    obs_id: '',
    start_time: '',
    end_time: '',
    broadcast_start_time: '',
    broadcast_end_time: '',
    encoder_id: '',
    producer_id: '',
    suite_id: '',
    type: '',
    canadian_content: false
  })
  const [commentatorSelections, setCommentatorSelections] = useState({ pxp: '', color: '', spare: '' })
  const [boothSelections, setBoothSelections] = useState({ cbcTv: '', cbcWeb: '', rcTvWeb: '' })
  const [obsEvents, setObsEvents] = useState([])
  const [obsEventsLoading, setObsEventsLoading] = useState(false)
  const [encodersList, setEncodersList] = useState([])
  const [producers, setProducers] = useState([])
  const [suites, setSuites] = useState([])
  const [commentators, setCommentators] = useState([])
  const [booths, setBooths] = useState([])
  const [networks, setNetworks] = useState([])
  const [allBlocks, setAllBlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const networkLabels = { cbcTv: 'CBC TV', cbcWeb: 'CBC Gem', rcTvWeb: 'R-C TV/WEB' }

  useEffect(() => {
    if (!draft) return
    const startEST = moment.utc(draft.startTime).tz('America/New_York')
    const endEST = moment.utc(draft.endTime).tz('America/New_York')
    const encoder = (encoders || []).find(e => e.name === draft.group)
    setFormData(prev => ({
      ...prev,
      start_time: startEST.format('YYYY-MM-DDTHH:mm'),
      end_time: endEST.format('YYYY-MM-DDTHH:mm'),
      encoder_id: encoder?.id || ''
    }))
  }, [draft, encoders])

  useEffect(() => {
    const load = async () => {
      try {
        const [encData, prodData, suiteData, commData, boothData, netData, blocksData] = await Promise.all([
          getResources('encoders'),
          getResources('producers'),
          getResources('suites'),
          getResources('commentators'),
          getResources('booths'),
          getResources('networks'),
          getBlocks()
        ])
        setEncodersList(encData || [])
        setProducers(prodData || [])
        setSuites(suiteData || [])
        setCommentators(commData || [])
        setBooths(boothData || [])
        setNetworks(netData || [])
        setAllBlocks(Array.isArray(blocksData) ? blocksData : (blocksData?.blocks ?? []))
      } catch (err) {
        console.error('Error loading reference data:', err)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!draft?.startTime || !draft?.endTime) return
    let cancelled = false
    setObsEventsLoading(true)
    setObsEvents([])
    const blockStart = moment.utc(draft.startTime)
    const blockEnd = moment.utc(draft.endTime)
    fetch(`${API_BASE}/api/events`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : (data?.events ?? [])
        const overlapping = list.filter(ev => {
          if (!ev.start_time || !ev.end_time) return false
          const evStart = moment.utc(ev.start_time)
          const evEnd = moment.utc(ev.end_time)
          return blockStart.isBefore(evEnd) && evStart.isBefore(blockEnd)
        })
        setObsEvents(overlapping)
      })
      .catch(() => { if (!cancelled) setObsEvents([]) })
      .finally(() => { if (!cancelled) setObsEventsLoading(false) })
    return () => { cancelled = true }
  }, [draft?.startTime, draft?.endTime])

  const handleObsEventSelect = (e) => {
    const id = e.target.value
    const ev = obsEvents.find(o => String(o.id) === id)
    if (!ev || !id) {
      // Unlinking: use draft times for start/end, clear broadcast
      if (!draft) return
      const startEST = moment.utc(draft.startTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
      const endEST = moment.utc(draft.endTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
      setFormData(prev => ({
        ...prev,
        obs_id: '',
        start_time: startEST,
        end_time: endEST,
        broadcast_start_time: '',
        broadcast_end_time: ''
      }))
      return
    }
    // Linking OBS event: use OBS event times for start/end, keep dragged times as broadcast
    const startEST = moment.utc(ev.start_time).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
    const endEST = moment.utc(ev.end_time).tz('America/New_York').format('YYYY-MM-DDTHH:mm')
    const broadcastStartEST = draft ? moment.utc(draft.startTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm') : ''
    const broadcastEndEST = draft ? moment.utc(draft.endTime).tz('America/New_York').format('YYYY-MM-DDTHH:mm') : ''
    setFormData(prev => ({
      ...prev,
      obs_id: id,
      name: !prev.name ? (ev.title || '') : prev.name,
      start_time: startEST,
      end_time: endEST,
      broadcast_start_time: broadcastStartEST,
      broadcast_end_time: broadcastEndEST
    }))
  }

  const sortedBooths = useMemo(() => {
    const vtBooths = []
    const visVobsBooths = []
    const vmBooths = []
    const otherBooths = []
    booths.forEach(booth => {
      const name = booth.name || ''
      if (name.startsWith('VT ')) vtBooths.push(booth)
      else if (name === 'VIS' || name === 'VOBS') visVobsBooths.push(booth)
      else if (name.startsWith('VM ')) vmBooths.push(booth)
      else otherBooths.push(booth)
    })
    const byNum = (a, b) => parseInt(a.name.match(/\d+/)?.[0] || '999', 10) - parseInt(b.name.match(/\d+/)?.[0] || '999', 10)
    vtBooths.sort(byNum)
    visVobsBooths.sort((a, b) => (a.name === 'VIS' ? -1 : 1))
    vmBooths.sort(byNum)
    return [...visVobsBooths, ...vtBooths, ...vmBooths, ...otherBooths]
  }, [booths])

  const isBoothAvailable = useMemo(() => {
    return (boothId) => {
      if (!formData.start_time || !formData.end_time || !boothId) return true
      const booth = booths.find(b => b.id === boothId)
      if (booth && (booth.name === 'VIS' || booth.name === 'VOBS')) return true
      const blockStart = formData.broadcast_start_time
        ? moment.tz(formData.broadcast_start_time, 'America/New_York').utc()
        : moment.tz(formData.start_time, 'America/New_York').utc()
      const blockEnd = formData.broadcast_end_time
        ? moment.tz(formData.broadcast_end_time, 'America/New_York').utc()
        : moment.tz(formData.end_time, 'America/New_York').utc()
      return !allBlocks.some(block => {
        const existingStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time) : block.start_time ? moment.utc(block.start_time) : null
        const existingEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time) : block.end_time ? moment.utc(block.end_time) : null
        if (!existingStart || !existingEnd) return false
        const hasBooth = block.booths && block.booths.some(b => b.id === boothId)
        if (!hasBooth) return false
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, formData.broadcast_start_time, formData.broadcast_end_time, allBlocks, booths])

  const isCommentatorAvailable = useMemo(() => {
    return (commentatorId) => {
      if (!formData.start_time || !formData.end_time || !commentatorId) return true
      const blockStart = formData.broadcast_start_time
        ? moment.tz(formData.broadcast_start_time, 'America/New_York').utc()
        : moment.tz(formData.start_time, 'America/New_York').utc()
      const blockEnd = formData.broadcast_end_time
        ? moment.tz(formData.broadcast_end_time, 'America/New_York').utc()
        : moment.tz(formData.end_time, 'America/New_York').utc()
      return !allBlocks.some(block => {
        const existingStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time) : block.start_time ? moment.utc(block.start_time) : null
        const existingEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time) : block.end_time ? moment.utc(block.end_time) : null
        if (!existingStart || !existingEnd) return false
        const hasCommentator = block.commentators && block.commentators.some(c => c.id === commentatorId)
        if (!hasCommentator) return false
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, formData.broadcast_start_time, formData.broadcast_end_time, allBlocks])

  const isEncoderAvailable = useMemo(() => {
    return (encoderId) => {
      if (!formData.start_time || !formData.end_time || !encoderId) return true
      const blockStart = formData.broadcast_start_time
        ? moment.tz(formData.broadcast_start_time, 'America/New_York').utc()
        : moment.tz(formData.start_time, 'America/New_York').utc()
      const blockEnd = formData.broadcast_end_time
        ? moment.tz(formData.broadcast_end_time, 'America/New_York').utc()
        : moment.tz(formData.end_time, 'America/New_York').utc()
      return !allBlocks.some(block => {
        const existingStart = block.broadcast_start_time ? moment.utc(block.broadcast_start_time) : block.start_time ? moment.utc(block.start_time) : null
        const existingEnd = block.broadcast_end_time ? moment.utc(block.broadcast_end_time) : block.end_time ? moment.utc(block.end_time) : null
        if (!existingStart || !existingEnd) return false
        if (block.encoder_id !== encoderId) return false
        return blockStart.isBefore(existingEnd) && existingStart.isBefore(blockEnd)
      })
    }
  }, [formData.start_time, formData.end_time, formData.broadcast_start_time, formData.broadcast_end_time, allBlocks])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.start_time || !formData.end_time) {
      setError('Name, start time, and end time are required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      const convertESTToUTC = (estDateTimeLocal) => {
        if (!estDateTimeLocal) return null
        return moment.tz(estDateTimeLocal, 'America/New_York').utc().toISOString()
      }
      const selectedObs = formData.obs_id ? obsEvents.find(o => String(o.id) === formData.obs_id) : null
      const blockData = {
        name: formData.name.trim(),
        obs_id: formData.obs_id || null,
        start_time: convertESTToUTC(formData.start_time),
        end_time: convertESTToUTC(formData.end_time),
        broadcast_start_time: convertESTToUTC(formData.broadcast_start_time),
        broadcast_end_time: convertESTToUTC(formData.broadcast_end_time),
        encoder_id: formData.encoder_id || null,
        producer_id: formData.producer_id || null,
        suite_id: formData.suite_id || null,
        source_event_id: selectedObs?.id || null,
        obs_group: selectedObs?.group || null,
        type: formData.type?.trim() || null,
        canadian_content: formData.canadian_content === true
      }
      const newBlock = await createBlock(blockData)
      try {
        if (commentatorSelections.pxp) await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.pxp, 'PxP')
        if (commentatorSelections.color) await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.color, 'Color')
        if (commentatorSelections.spare) await addBlockRelationship(newBlock.id, 'commentators', commentatorSelections.spare, 'Spare')
        const addBoothWithNetwork = async (boothId, networkLabel) => {
          if (!boothId) return
          const network = networks.find(n => {
            if (!n.name) return false
            const nl = n.name.toLowerCase().trim()
            const ll = networkLabel.toLowerCase().trim()
            if (n.name === networkLabel) return true
            if (ll === 'cbc tv' && nl.includes('cbc tv')) return true
            if ((ll === 'cbc gem' || ll === 'cbc web') && (nl.includes('cbc gem') || nl.includes('gem') || nl === 'web')) return true
            if ((ll.includes('r-c') || ll.includes('rc tv')) && (nl.includes('r-c') || nl.includes('radio-canada'))) return true
            return false
          })
          if (network?.id) await addBlockRelationship(newBlock.id, 'booths', boothId, null, network.id)
        }
        if (boothSelections.cbcTv) await addBoothWithNetwork(boothSelections.cbcTv, networkLabels.cbcTv)
        if (boothSelections.cbcWeb) await addBoothWithNetwork(boothSelections.cbcWeb, networkLabels.cbcWeb)
        if (boothSelections.rcTvWeb) await addBoothWithNetwork(boothSelections.rcTvWeb, networkLabels.rcTvWeb)
      } catch (relErr) {
        console.error('Error adding relationships:', relErr)
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create block')
    } finally {
      setLoading(false)
    }
  }

  if (!draft) return null

  const encodersSource = encoders?.length ? encoders : encodersList

  return (
    <div className="h-full bg-white border-l border-gray-300 shadow-lg flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">New Block</h2>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none" title="Close">×</button>
      </div>
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
        )}

        <div className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium mb-1">Link to OBS event</label>
            <select
              value={formData.obs_id}
              onChange={handleObsEventSelect}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={obsEventsLoading}
            >
              <option value="">None</option>
              {obsEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || ev.id} {ev.group ? `(${ev.group})` : ''}
                </option>
              ))}
            </select>
            {obsEventsLoading && <p className="text-xs text-gray-500 mt-1">Loading OBS events…</p>}
          </div>

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
                  min={formData.start_time ? `${formData.start_time.split('T')[0]}T00:00` : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={() => {
                    if (!formData.broadcast_start_time && formData.start_time) {
                      const suggested = moment.tz(formData.start_time, 'America/New_York').subtract(10, 'minutes').format('YYYY-MM-DDTHH:mm')
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
                  min={formData.end_time ? `${formData.end_time.split('T')[0]}T00:00` : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  onClick={() => {
                    if (!formData.broadcast_end_time && formData.end_time) {
                      const suggested = moment.tz(formData.end_time, 'America/New_York').add(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_end_time: suggested }))
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                {BLOCK_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="create_canadian"
                checked={formData.canadian_content}
                onChange={(e) => setFormData({ ...formData, canadian_content: e.target.checked })}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="create_canadian" className="text-sm font-medium text-red-600 cursor-pointer">🍁</label>
            </div>
          </div>

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
                  {encodersSource.map(e => {
                    const available = isEncoderAvailable(e.id)
                    return (
                      <option key={e.id} value={e.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                        {e.name}{!available ? ' (Unavailable)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">CBC TV - Booth</label>
                  <select
                    value={boothSelections.cbcTv}
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcTv: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {sortedBooths.map(b => {
                      const available = isBoothAvailable(b.id)
                      return (
                        <option key={b.id} value={b.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                          {b.name}{!available ? ' (Unavailable)' : ''}
                        </option>
                      )
                    })}
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
                    {sortedBooths.map(b => {
                      const available = isBoothAvailable(b.id)
                      return (
                        <option key={b.id} value={b.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                          {b.name}{!available ? ' (Unavailable)' : ''}
                        </option>
                      )
                    })}
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
                    {sortedBooths.map(b => {
                      const available = isBoothAvailable(b.id)
                      return (
                        <option key={b.id} value={b.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                          {b.name}{!available ? ' (Unavailable)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

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
                      {commentators.map(c => {
                        const available = isCommentatorAvailable(c.id)
                        return (
                          <option key={c.id} value={c.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                            {c.name}{!available ? ' (Unavailable)' : ''}
                          </option>
                        )
                      })}
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
                      {commentators.map(c => {
                        const available = isCommentatorAvailable(c.id)
                        return (
                          <option key={c.id} value={c.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                            {c.name}{!available ? ' (Unavailable)' : ''}
                          </option>
                        )
                      })}
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
                      {commentators.map(c => {
                        const available = isCommentatorAvailable(c.id)
                        return (
                          <option key={c.id} value={c.id} disabled={!available} style={{ color: available ? 'inherit' : '#9ca3af' }}>
                            {c.name}{!available ? ' (Unavailable)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Block'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default CreateBlockForm
