import React, { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const FLAG_CODE_OVERRIDES = { ROM: 'ROU', FIJ: 'FJI', LBN: 'LIB', SGP: 'SIN' }
function getFlagSrc(code) {
  if (!code) return null
  return `/flags/${FLAG_CODE_OVERRIDES[code] || code}.jpg`
}

function TeamFlag({ code, size = 'lg' }) {
  const src = getFlagSrc(code)
  if (!src) return null
  const cls = size === 'sm' ? 'h-5 w-7' : 'h-10 w-14'
  return <img src={src} alt={code} className={`${cls} object-cover rounded-sm flex-shrink-0`} onError={e => { e.target.style.display = 'none' }} />
}

const TABS = [
  { id: 'results', label: 'Results' },
  { id: 'pbp', label: 'Play By Play' },
  { id: 'stats', label: 'Stats' },
  { id: 'pool', label: 'Pool Standing' },
  { id: 'brackets', label: 'Brackets' },
]

export default function CurlingDetailPage() {
  const { matchup } = useParams()
  const [searchParams] = useSearchParams()
  const [home, away] = (matchup || '').split('-')
  const dateParam = searchParams.get('date') || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('results')

  const apiUrl = `${API_BASE}/api/cur-game-detail?home=${home}&away=${away}${dateParam ? `&date=${dateParam}` : ''}`

  useEffect(() => {
    if (!home || !away) return
    setLoading(true)
    setError(null)
    fetch(apiUrl)
      .then(r => r.json().then(d => r.ok ? d : Promise.reject(d)))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.error || e.message || 'Failed to load'); setLoading(false) })
  }, [home, away, dateParam])

  useEffect(() => {
    if (!data || data.resultStatus === 'OFFICIAL') return
    const id = setInterval(() => {
      fetch(apiUrl)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d) })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [data?.resultStatus, apiUrl])

  if (loading) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-gray-500 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="h-full bg-gray-900 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-lg">{error || 'Game not found'}</p>
        <Link to="/cbc-timeline" className="text-amber-400 hover:underline text-sm">&larr; Back to CBC-RC TX</Link>
      </div>
    )
  }

  const ht = data.homeTeam || {}
  const at = data.awayTeam || {}
  const isLive = data.resultStatus === 'LIVE' || data.resultStatus === 'INTERMEDIATE'
  const isOfficial = data.resultStatus === 'OFFICIAL'
  const statusLabel = isLive ? 'LIVE' : isOfficial ? 'FINAL' : data.resultStatus || ''
  const statusColor = isLive ? 'bg-red-600' : isOfficial ? 'bg-green-700' : 'bg-gray-600'

  return (
    <div className="h-full bg-gray-900 text-white overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <Link to="/cbc-timeline" className="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block">&larr; Back to CBC-RC TX</Link>

        {/* Header */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-6">
          <div className="bg-sky-700 px-6 py-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white uppercase tracking-wide">
              {data.eventName || 'Curling'} &middot; {data.subEvent || 'Result'} {isLive ? '(Intermediate)' : isOfficial ? '(Official)' : ''}
            </span>
            <span className={`${statusColor} text-white text-xs font-bold px-2 py-0.5 rounded`}>{statusLabel}</span>
          </div>
          <div className="px-6 py-6 flex items-center justify-center gap-6 md:gap-12">
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <TeamFlag code={ht.code} />
              <span className="font-bold text-lg">{ht.name || ht.code}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-5xl font-black tabular-nums">{ht.score ?? 0}</span>
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  {isOfficial ? 'Final' : `End ${data.period || ''}`}
                </span>
                <span className="text-gray-600 text-2xl">—</span>
              </div>
              <span className="text-5xl font-black tabular-nums">{at.score ?? 0}</span>
            </div>
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <TeamFlag code={at.code} />
              <span className="font-bold text-lg">{at.name || at.code}</span>
            </div>
          </div>
          {data.venueName && (
            <div className="px-6 pb-3 text-center text-xs text-gray-400">{data.venueName}</div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'results' && <ResultsTab data={data} />}
        {tab === 'pbp' && <PlayByPlayTab data={data} />}
        {tab === 'stats' && <StatsTab data={data} />}
        {tab === 'pool' && <PoolStandingTab data={data} />}
        {tab === 'brackets' && <BracketsTab data={data} />}
      </div>
    </div>
  )
}

/* ============================== Results Tab ============================== */
function ResultsTab({ data }) {
  const ht = data.homeTeam || {}
  const at = data.awayTeam || {}
  const periods = data.periods || []

  return (
    <div className="space-y-6">
      {/* End-by-end score table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left px-4 py-2 font-medium">Team</th>
              <th className="px-2 py-2 text-center text-xs font-medium">RT</th>
              {periods.map(p => <th key={p.code} className="px-2 py-2 text-center font-medium w-8">{p.code}</th>)}
              <th className="px-3 py-2 text-center font-semibold text-white">T</th>
            </tr>
          </thead>
          <tbody>
            {[ht, at].map((team, idx) => (
              <tr key={idx} className="border-b border-gray-700/50 last:border-0">
                <td className="px-4 py-2 font-semibold flex items-center gap-2">
                  <TeamFlag code={team.code} size="sm" />
                  {team.code}
                </td>
                <td className="px-2 py-2 text-center text-gray-500 text-xs">—</td>
                {periods.map(p => {
                  const earned = idx === 0 ? p.homeEarned : p.awayEarned
                  const isScoring = earned > 0
                  return (
                    <td key={p.code} className={`px-2 py-2 text-center ${isScoring ? 'text-white font-bold' : 'text-gray-400'}`}>
                      {earned}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center font-black text-white text-base">{team.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hammer indicators */}
      {periods.some(p => p.hammer) && (
        <div className="flex gap-3 items-center text-xs text-gray-400 px-1">
          <span className="font-medium text-gray-300">Hammer:</span>
          {periods.map(p => {
            if (!p.hammer) return <span key={p.code} className="text-gray-600">E{p.code}: —</span>
            const hammerTeam = p.hammer === 'home' ? ht.code : at.code
            return <span key={p.code}>E{p.code}: <span className="text-white font-medium">{hammerTeam}</span></span>
          })}
        </div>
      )}

      {/* Team Boxscores */}
      {[{ team: ht, label: 'home' }, { team: at, label: 'away' }].map(({ team, label }) => (
        <div key={label} className="space-y-2">
          <h3 className="text-sm font-semibold text-sky-300 uppercase tracking-wide text-center">
            {team.name || team.code} Boxscore
          </h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700 text-xs">
                  <th className="px-3 py-2 text-center w-10">Pos</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-center">Success</th>
                  <th className="px-3 py-2 text-center">CW</th>
                  <th className="px-3 py-2 text-center">CCW</th>
                  <th className="px-3 py-2 text-center">Draw</th>
                  <th className="px-3 py-2 text-center">Takeout</th>
                </tr>
              </thead>
              <tbody>
                {(team.athletes || []).map((a, i) => {
                  const hasData = a.success?.value != null && a.success.value !== '0' && a.success.value !== 0
                  return (
                    <tr key={i} className={`border-b border-gray-700/50 last:border-0 ${!hasData ? 'text-gray-500' : ''}`}>
                      <td className="px-3 py-2 text-center text-gray-400">{a.position}</td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{a.familyName}, {a.givenName}</td>
                      <td className="px-3 py-2 text-center">
                        {a.success?.value != null ? a.success.value : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">{a.cw?.value ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{a.ccw?.value ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{a.draw?.value ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{a.takeout?.value ?? '—'}</td>
                    </tr>
                  )
                })}
                {/* Team totals */}
                {team.gameSuccess && (
                  <tr className="border-t border-gray-600 font-semibold">
                    <td className="px-3 py-2 text-center"></td>
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-center">{team.gameSuccess?.value ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{team.cw?.value ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{team.ccw?.value ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{team.draw?.value ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{team.takeout?.value ?? '—'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Coaches */}
          {team.coaches?.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              Coaches ({team.name || team.code}): {team.coaches.map(c => `${c.givenName} ${c.familyName} (${c.function === 'COACH' ? 'Coach' : c.function})`).join(', ')}
            </p>
          )}
        </div>
      ))}

      {/* Officials */}
      {data.officials?.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Officials</h3>
          <p className="text-sm text-gray-300 leading-relaxed">
            {data.officials.map(o => {
              const fn = { UDC: 'Deputy Chief Umpire', UM: 'Game Umpire', TK: 'Chief Timer', TK_AST: 'Deputy Chief Timer', STAT: 'Chief Statistician / Timing', ICE_TCH: 'Chief Ice Technician', ICE_AST: 'Deputy Chief Ice Technician' }
              return `${o.givenName} ${o.familyName} (${fn[o.function] || o.function})`
            }).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

/* ============================== Play By Play Tab ============================== */
function PlayByPlayTab({ data }) {
  const pbp = data.playByPlay
  if (!pbp || !pbp.actions || pbp.actions.length === 0) {
    return <p className="text-gray-400">No play-by-play data available.</p>
  }

  const actions = pbp.actions
  const ht = data.homeTeam || {}
  const at = data.awayTeam || {}

  // Group by end
  const byEnd = {}
  for (const a of actions) {
    const end = a.end || 0
    if (!byEnd[end]) byEnd[end] = []
    byEnd[end].push(a)
  }
  const endKeys = Object.keys(byEnd).sort((a, b) => parseInt(a) - parseInt(b))

  const [selectedEnd, setSelectedEnd] = useState(() => endKeys[endKeys.length - 1] || '1')
  const [selectedStone, setSelectedStone] = useState(null)
  const leftRef = useRef(null)
  const [leftH, setLeftH] = useState(null)

  useEffect(() => {
    if (!leftRef.current) return
    const measure = () => setLeftH(leftRef.current.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(leftRef.current)
    return () => ro.disconnect()
  }, [selectedEnd, selectedStone])

  const endActions = byEnd[selectedEnd] || []
  // Sort by stone number ascending for display
  const sortedActions = [...endActions].sort((a, b) => a.stoneNum - b.stoneNum)
  const displayAction = selectedStone != null
    ? sortedActions.find(a => a.stoneNum === selectedStone)
    : sortedActions[sortedActions.length - 1]

  const ordinalEnd = (n) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  const taskLabels = {
    'FRONT': 'Front', 'DRAW': 'Draw', 'HIT-ROLL': 'Hit & Roll', 'TAKE-OUT': 'Take Out',
    'DOUBLE': 'Double', 'CLEARING': 'Clearing', 'GUARD': 'Guard', 'RAISE': 'Raise',
    'WICK': 'Wick', 'PROMOTION': 'Promotion', 'FREEZE': 'Freeze', 'PEEL': 'Peel',
  }

  return (
    <div className="space-y-4">
      {/* End selector */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-400 font-medium">End:</span>
        {endKeys.map(k => (
          <button
            key={k}
            onClick={() => { setSelectedEnd(k); setSelectedStone(null) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedEnd === k
                ? 'bg-sky-700 text-white border-sky-600'
                : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        {/* Left: sheet image + action info */}
        <div ref={leftRef} className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          {displayAction && (
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path strokeWidth="2" d="M12 6v6l4 2" /></svg>
                    <span>{ordinalEnd(parseInt(selectedEnd))} End</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Stone {displayAction.stoneNum}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{taskLabels[displayAction.task] || displayAction.task} {displayAction.turn && <span className="text-gray-400 font-normal">{displayAction.turn}</span>}</p>
                  {displayAction.points && <p className="text-xs text-gray-400">Points: {displayAction.points}%</p>}
                </div>
              </div>

              {displayAction.playerName && (
                <div className="flex items-center gap-2">
                  <TeamFlag code={displayAction.team} size="sm" />
                  <span className="text-sm font-medium">{displayAction.playerName}</span>
                </div>
              )}

              {/* Sheet image — scaled down to fit */}
              {displayAction.imageData && (
                <div className="bg-white rounded-lg overflow-hidden max-w-[320px] mx-auto">
                  <img
                    src={displayAction.imageData}
                    alt={`End ${selectedEnd} Stone ${displayAction.stoneNum}`}
                    className="w-full h-auto"
                  />
                </div>
              )}
            </div>
          )}
          {!displayAction && <p className="text-gray-500 text-sm">No data for this end.</p>}
        </div>

        {/* Right: stone list for this end — capped to left panel height */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col" style={leftH ? { maxHeight: leftH } : undefined}>
          <div className="px-4 py-2 border-b border-gray-700 shrink-0">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Stones - End {selectedEnd}</h3>
          </div>
          <div className="divide-y divide-gray-700/50 overflow-y-auto flex-1 min-h-0">
            {sortedActions.map((a, i) => {
              const isActive = selectedStone === a.stoneNum || (selectedStone == null && i === sortedActions.length - 1)
              const teamColor = a.team === ht.code ? 'text-blue-300' : a.team === at.code ? 'text-red-300' : 'text-gray-400'
              return (
                <button
                  key={i}
                  onClick={() => setSelectedStone(a.stoneNum)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    isActive ? 'bg-sky-900/40' : 'hover:bg-gray-700/40'
                  }`}
                >
                  <span className="text-xs text-gray-500 w-5 text-right shrink-0">{a.stoneNum}</span>
                  <TeamFlag code={a.team} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${teamColor}`}>{a.team}</span>
                      <span className="text-xs text-gray-400">{taskLabels[a.task] || a.task}</span>
                      {a.turn && <span className="text-xs text-gray-500">{a.turn}</span>}
                    </div>
                    {a.playerName && <p className="text-xs text-gray-500 truncate">{a.playerName}</p>}
                  </div>
                  {a.points && <span className="text-xs text-gray-400 shrink-0">{a.points}%</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================== Stats Tab ============================== */
function StatsTab({ data }) {
  const ranking = data.ranking
  const [mode, setMode] = useState('teams')

  if (!ranking) return <p className="text-gray-400">No tournament stats available.</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[{ id: 'teams', label: 'Teams' }, { id: 'individuals', label: 'Individuals' }].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              mode === m.id ? 'bg-sky-700 text-white border-sky-600' : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide text-center">
        {mode === 'teams' ? 'Team Ranking: Shot Success Percentage' : 'Individual Ranking: Shot Success Percentage'}
      </h3>

      {mode === 'teams' ? (
        <TeamRankingTable teams={ranking.teams || []} />
      ) : (
        <IndRankingTable players={ranking.players || []} />
      )}
    </div>
  )
}

function TeamRankingTable({ teams }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700 text-xs">
            <th className="px-3 py-2 text-center w-14">Rank</th>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-3 py-2 text-center">Matches</th>
            <th className="px-3 py-2 text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={i} className="border-b border-gray-700/50 last:border-0">
              <td className="px-3 py-2 text-center text-gray-400 font-medium">{t.rank || i + 1}</td>
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <TeamFlag code={t.teamCode} size="sm" />
                  {t.teamName || t.teamCode}
                </div>
              </td>
              <td className="px-3 py-2 text-center text-gray-300">{t.matches}</td>
              <td className="px-3 py-2 text-center font-bold text-white">{t.avg?.toFixed(1) ?? '—'}</td>
            </tr>
          ))}
          {teams.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-4 text-gray-500 text-center">No data available</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function IndRankingTable({ players }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700 text-xs">
            <th className="px-3 py-2 text-center w-14">Rank</th>
            <th className="px-3 py-2 text-center w-16">NOC</th>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-center">Matches</th>
            <th className="px-3 py-2 text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} className="border-b border-gray-700/50 last:border-0">
              <td className="px-3 py-2 text-center text-gray-400 font-medium">{p.rank || i + 1}</td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center gap-1.5 justify-center">
                  <TeamFlag code={p.teamCode} size="sm" />
                  <span className="text-xs text-gray-400">{p.teamCode}</span>
                </div>
              </td>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{p.familyName}, {p.givenName}</td>
              <td className="px-3 py-2 text-center text-gray-300">{p.matches}</td>
              <td className="px-3 py-2 text-center font-bold text-white">{p.avg?.toFixed(1) ?? '—'}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-gray-500 text-center">No data available</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ============================== Pool Standing Tab ============================== */
const GROUP_LABELS = { GPA: 'Group A', GPB: 'Group B', GPC: 'Group C', GPD: 'Group D', PREL: 'Round Robin' }

function PoolStandingTab({ data }) {
  const pools = data.poolStandings || (data.poolStanding ? [data.poolStanding] : [])
  const [activeGroup, setActiveGroup] = useState(
    () => {
      const homeCode = data.homeTeam?.code
      const match = pools.find(p => p.groupCode !== 'PREL' && p.standings?.some(s => s.teamCode === homeCode))
      return match?.groupCode || pools[0]?.groupCode || ''
    }
  )

  if (pools.length === 0) return <p className="text-gray-400">No pool standing data available.</p>

  const active = pools.find(p => p.groupCode === activeGroup) || pools[0]
  const standings = active?.standings || []

  return (
    <div className="space-y-5">
      {pools.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pools.map(p => (
            <button
              key={p.groupCode}
              onClick={() => setActiveGroup(p.groupCode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeGroup === p.groupCode
                  ? 'bg-sky-700 text-white border-sky-600'
                  : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
              }`}
            >
              {GROUP_LABELS[p.groupCode] || p.groupCode}
            </button>
          ))}
        </div>
      )}

      {/* Standings table - curling uses W/L (no OT wins/losses like hockey, no goals) */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700 text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 text-center w-10">Rk</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th colSpan={3} className="px-2 py-1 text-center border-b border-gray-700/50">Matches</th>
              <th className="px-3 py-2 text-center">Qual</th>
            </tr>
            <tr className="text-gray-500 border-b border-gray-700 text-[10px]">
              <th></th><th></th>
              <th className="px-2 py-1 text-center">Played</th>
              <th className="px-2 py-1 text-center">Won</th>
              <th className="px-2 py-1 text-center">Lost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const isHighlighted = s.teamCode === data.homeTeam?.code || s.teamCode === data.awayTeam?.code
              const isQualified = s.rank <= 2 && s.played >= 4
              return (
                <tr key={i} className={`border-b border-gray-700/50 last:border-0 ${isHighlighted ? 'bg-sky-900/30' : ''}`}>
                  <td className="px-3 py-2 text-center text-gray-400 font-medium">{s.rank ? (s.rank === standings.filter(x => x.rank === s.rank).length > 1 ? '=' : '') + s.rank : ''}</td>
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <TeamFlag code={s.teamCode} size="sm" />
                      {s.teamCode}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.played}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.won}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.lost}</td>
                  <td className="px-3 py-2 text-center font-semibold">{isQualified ? <span className="text-green-400">Q</span> : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Matches */}
      {(() => {
        const seen = new Set()
        const matches = []
        for (const s of standings) {
          for (const o of (s.opponents || [])) {
            const pair = [s.teamCode, o.teamCode].sort().join('-')
            const key = `${pair}-${o.date}`
            if (seen.has(key)) continue
            seen.add(key)
            const sIsAway = o.homeAway === 'A'
            const rawScores = o.result ? o.result.split('-').map(x => x.trim()) : ['—', '—']
            const leftTeam = sIsAway ? s : { teamCode: o.teamCode, teamName: o.teamName }
            const rightTeam = sIsAway ? { teamCode: o.teamCode, teamName: o.teamName } : s
            const leftScore = sIsAway ? rawScores[0] : rawScores[1]
            const rightScore = sIsAway ? rawScores[1] : rawScores[0]
            matches.push({ key, date: o.date, time: o.time, leftTeam, rightTeam, leftScore, rightScore })
          }
        }
        matches.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        if (matches.length === 0) return null
        return (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide text-center">Matches</h3>
            <div className="space-y-2">
              {matches.map(m => (
                <div key={m.key} className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500 w-32 shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path strokeWidth="2" d="M12 6v6l4 2" /></svg>
                    <span>{m.date}</span>
                    <span className="text-gray-600">{m.time}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-1 justify-center">
                    <div className="flex items-center gap-2 justify-end min-w-[140px]">
                      <span className="font-medium text-sm text-gray-200">{m.leftTeam.teamName || m.leftTeam.teamCode}</span>
                      <TeamFlag code={m.leftTeam.teamCode} size="sm" />
                    </div>
                    <span className="text-lg font-bold text-white tabular-nums min-w-[60px] text-center">{m.leftScore} - {m.rightScore}</span>
                    <div className="flex items-center gap-2 justify-start min-w-[140px]">
                      <TeamFlag code={m.rightTeam.teamCode} size="sm" />
                      <span className="font-medium text-sm text-gray-200">{m.rightTeam.teamName || m.rightTeam.teamCode}</span>
                    </div>
                  </div>
                  <div className="w-32 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ============================== Brackets Tab ============================== */
function BracketsTab({ data }) {
  const brackets = data.brackets
  if (!brackets) return <p className="text-gray-400">No bracket data available.</p>

  const roundLabels = { QFNL: 'Quarterfinals', SFNL: 'Semi-finals', 'BRO-': 'Bronze Match', FNL: 'Gold Match' }

  return (
    <div className="space-y-6">
      {brackets.rounds?.map(round => (
        <div key={round.code} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-amber-300 uppercase tracking-wide mb-4">
            {roundLabels[round.code] || round.code}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {round.matches.map((m, i) => (
              <div key={i} className="bg-gray-700/50 rounded-lg border border-gray-600 p-3">
                <div className="text-xs text-gray-500 mb-2">{m.date}{m.time ? ` · ${m.time}` : ''}</div>
                {m.teams.map((t, j) => (
                  <div key={j} className={`flex items-center justify-between py-1 ${t.wlt === 'W' ? 'text-white' : 'text-gray-400'}`}>
                    <div className="flex items-center gap-2">
                      <TeamFlag code={t.teamCode} size="sm" />
                      <span className={`font-medium ${t.wlt === 'W' ? 'font-bold' : ''}`}>
                        {t.teamName || t.teamCode || 'TBD'}
                      </span>
                      {t.seed && <span className="text-xs text-gray-500">({t.seed})</span>}
                    </div>
                    <span className={`font-bold tabular-nums ${t.wlt === 'W' ? 'text-white' : ''}`}>{t.result || '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
