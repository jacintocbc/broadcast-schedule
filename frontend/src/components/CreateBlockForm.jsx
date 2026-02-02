import { useState, useEffect, useMemo, useRef } from 'react'
import moment from 'moment'
import 'moment-timezone'
import { createBlock, addBlockRelationship, getBlocks, getResources } from '../utils/api'
import { BLOCK_TYPES } from '../utils/blockTypes'
import { SHARED_BOOTH_SORT_ORDER } from '../utils/boothConstants'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function CreateBlockForm({ draft, selectedDate, encoders, onClose, onSuccess, onDraftChange, dark }) {
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
  const hasUserEditedTimes = useRef(false)

  useEffect(() => {
    if (!draft) return
    const startMilan = moment.utc(draft.startTime).tz('Europe/Rome')
    const endMilan = moment.utc(draft.endTime).tz('Europe/Rome')
    const encoder = (encoders || []).find(e => e.name === draft.group)
    setFormData(prev => ({
      ...prev,
      start_time: startMilan.format('YYYY-MM-DDTHH:mm'),
      end_time: endMilan.format('YYYY-MM-DDTHH:mm'),
      encoder_id: encoder?.id || ''
    }))
  }, [draft, encoders])

  // Reset "user edited" flag when draft changes (e.g. new drag)
  useEffect(() => {
    hasUserEditedTimes.current = false
  }, [draft?.startTime, draft?.endTime])

  // Notify parent of effective times for timeline outline (broadcast overrides when both set)
  // Only call when user has explicitly edited times - never on initial load, so the drag dimensions stay exact
  useEffect(() => {
    if (!onDraftChange || !draft?.group || !hasUserEditedTimes.current) return
    const hasBroadcast = formData.broadcast_start_time && formData.broadcast_end_time
    const startLocal = hasBroadcast ? formData.broadcast_start_time : formData.start_time
    const endLocal = hasBroadcast ? formData.broadcast_end_time : formData.end_time
    if (!startLocal || !endLocal) return
    const startTime = moment.tz(startLocal, 'Europe/Rome').utc().toISOString()
    const endTime = moment.tz(endLocal, 'Europe/Rome').utc().toISOString()
    if (!moment.utc(startTime).isBefore(moment.utc(endTime))) return
    if (draft.startTime === startTime && draft.endTime === endTime) return
    onDraftChange({ startTime, endTime })
  }, [formData.start_time, formData.end_time, formData.broadcast_start_time, formData.broadcast_end_time, draft?.group, draft?.startTime, draft?.endTime, onDraftChange])

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
    hasUserEditedTimes.current = true
    const id = e.target.value
    const ev = obsEvents.find(o => String(o.id) === id)
    if (!ev || !id) {
      // Unlinking: use draft times for start/end, clear broadcast
      if (!draft) return
      const startMilan = moment.utc(draft.startTime).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
      const endMilan = moment.utc(draft.endTime).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
      setFormData(prev => ({
        ...prev,
        obs_id: '',
        start_time: startMilan,
        end_time: endMilan,
        broadcast_start_time: '',
        broadcast_end_time: ''
      }))
      return
    }
    // Linking OBS event: use OBS event times for start/end, keep dragged times as broadcast
    const startMilan = moment.utc(ev.start_time).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
    const endMilan = moment.utc(ev.end_time).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm')
    const broadcastStartMilan = draft ? moment.utc(draft.startTime).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm') : ''
    const broadcastEndMilan = draft ? moment.utc(draft.endTime).tz('Europe/Rome').format('YYYY-MM-DDTHH:mm') : ''
    setFormData(prev => ({
      ...prev,
      obs_id: id,
      name: !prev.name ? (ev.title || '') : prev.name,
      start_time: startMilan,
      end_time: endMilan,
      broadcast_start_time: broadcastStartMilan,
      broadcast_end_time: broadcastEndMilan
    }))
  }

  const sortedBooths = useMemo(() => {
    const vtBooths = []
    const sharedBooths = []
    const vmBooths = []
    const otherBooths = []
    booths.forEach(booth => {
      const name = booth.name || ''
      if (name.startsWith('VT ')) vtBooths.push(booth)
      else if (SHARED_BOOTH_SORT_ORDER.includes(name)) sharedBooths.push(booth)
      else if (name.startsWith('VM ')) vmBooths.push(booth)
      else otherBooths.push(booth)
    })
    const byNum = (a, b) => parseInt(a.name.match(/\d+/)?.[0] || '999', 10) - parseInt(b.name.match(/\d+/)?.[0] || '999', 10)
    vtBooths.sort(byNum)
    sharedBooths.sort((a, b) => {
      const ai = SHARED_BOOTH_SORT_ORDER.indexOf(a.name)
      const bi = SHARED_BOOTH_SORT_ORDER.indexOf(b.name)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    vmBooths.sort(byNum)
    return [...sharedBooths, ...vtBooths, ...vmBooths, ...otherBooths]
  }, [booths])

  // Booths and commentators can be used in overlapping blocks (no conflict check)
  const isBoothAvailable = useMemo(() => () => true, [])
  const isCommentatorAvailable = useMemo(() => () => true, [])

  const isEncoderAvailable = useMemo(() => {
    return (encoderId) => {
      if (!formData.start_time || !formData.end_time || !encoderId) return true
      const blockStart = formData.broadcast_start_time
        ? moment.tz(formData.broadcast_start_time, 'Europe/Rome').utc()
        : moment.tz(formData.start_time, 'Europe/Rome').utc()
      const blockEnd = formData.broadcast_end_time
        ? moment.tz(formData.broadcast_end_time, 'Europe/Rome').utc()
        : moment.tz(formData.end_time, 'Europe/Rome').utc()
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
      const convertMilanToUTC = (milanDateTimeLocal) => {
        if (!milanDateTimeLocal) return null
        return moment.tz(milanDateTimeLocal, 'Europe/Rome').utc().toISOString()
      }
      const selectedObs = formData.obs_id ? obsEvents.find(o => String(o.id) === formData.obs_id) : null
      const blockData = {
        name: formData.name.trim(),
        obs_id: formData.obs_id || null,
        start_time: convertMilanToUTC(formData.start_time),
        end_time: convertMilanToUTC(formData.end_time),
        broadcast_start_time: convertMilanToUTC(formData.broadcast_start_time),
        broadcast_end_time: convertMilanToUTC(formData.broadcast_end_time),
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
  const inputClass = dark ? 'w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white' : 'w-full px-3 py-2 border border-gray-300 rounded-md'
  const labelClass = dark ? 'block text-sm font-medium mb-1 text-gray-300' : 'block text-sm font-medium mb-1'
  const sectionTitleClass = dark ? 'text-sm font-semibold text-gray-300 uppercase mb-2' : 'text-sm font-semibold text-gray-700 uppercase mb-2'
  const smallLabelClass = dark ? 'block text-xs text-gray-400 mb-1' : 'block text-xs text-gray-600 mb-1'

  return (
    <div className={`h-full flex flex-col min-h-0 ${dark ? 'bg-gray-800' : 'bg-white border-l border-gray-300 shadow-lg'}`} data-theme={dark ? 'dark' : undefined}>
      <div className={`p-4 border-b flex items-center justify-between ${dark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
        <h2 className={`text-xl font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>New Block</h2>
        <button type="button" onClick={onClose} className={`text-2xl leading-none ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`} title="Close">×</button>
      </div>
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {error && (
          <div className={`mb-4 p-3 border rounded ${dark ? 'bg-red-900/30 border-red-500 text-red-200' : 'bg-red-100 border-red-400 text-red-700'}`}>{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Event Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Link to OBS event</label>
            <select
              value={formData.obs_id}
              onChange={handleObsEventSelect}
              className={inputClass}
              disabled={obsEventsLoading}
            >
              <option value="">None</option>
              {obsEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || ev.id} {ev.group ? `(${ev.group})` : ''}
                </option>
              ))}
            </select>
            {obsEventsLoading && <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading OBS events…</p>}
          </div>

          <div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Start Time * (Milan)</label>
                <input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End Time * (Milan)</label>
                <input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => { hasUserEditedTimes.current = true; setFormData({ ...formData, end_time: e.target.value }) }}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Broadcast Start Time (Milan)</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_start_time}
                  onChange={(e) => setFormData({ ...formData, broadcast_start_time: e.target.value })}
                  min={formData.start_time ? `${formData.start_time.split('T')[0]}T00:00` : undefined}
                  className={inputClass}
                  onClick={() => {
                    if (!formData.broadcast_start_time && formData.start_time) {
                      const suggested = moment.tz(formData.start_time, 'Europe/Rome').subtract(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_start_time: suggested }))
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Broadcast End Time (Milan)</label>
                <input
                  type="datetime-local"
                  value={formData.broadcast_end_time}
                  onChange={(e) => { hasUserEditedTimes.current = true; setFormData({ ...formData, broadcast_end_time: e.target.value }) }}
                  min={formData.end_time ? `${formData.end_time.split('T')[0]}T00:00` : undefined}
                  className={inputClass}
                  onClick={() => {
                    if (!formData.broadcast_end_time && formData.end_time) {
                      hasUserEditedTimes.current = true
                      const suggested = moment.tz(formData.end_time, 'Europe/Rome').add(10, 'minutes').format('YYYY-MM-DDTHH:mm')
                      setFormData(prev => ({ ...prev, broadcast_end_time: suggested }))
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className={labelClass}>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className={inputClass}
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
            <h3 className={sectionTitleClass}>Resources</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Encoder</label>
                <select
                  value={formData.encoder_id}
                  onChange={(e) => setFormData({ ...formData, encoder_id: e.target.value })}
                  className={inputClass}
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
                    className={inputClass}
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
                  <label className={labelClass}>CBC Gem - Booth</label>
                  <select
                    value={boothSelections.cbcWeb}
                    onChange={(e) => setBoothSelections({ ...boothSelections, cbcWeb: e.target.value })}
                    className={inputClass}
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
                    className={inputClass}
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
                <label className={labelClass}>Commentators</label>
                <div className="space-y-2">
                  <div>
                    <label className={smallLabelClass}>PxP</label>
                    <select
                      value={commentatorSelections.pxp}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, pxp: e.target.value })}
                      className={inputClass}
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
                    <label className={smallLabelClass}>Color</label>
                    <select
                      value={commentatorSelections.color}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, color: e.target.value })}
                      className={inputClass}
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
                    <label className={smallLabelClass}>Spare</label>
                    <select
                      value={commentatorSelections.spare}
                      onChange={(e) => setCommentatorSelections({ ...commentatorSelections, spare: e.target.value })}
                      className={inputClass}
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
        </div>
        </div>

        <div className={`flex-shrink-0 p-4 border-t flex gap-2 ${dark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Block'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-white rounded-md ${dark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-400 hover:bg-gray-500'}`}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateBlockForm
