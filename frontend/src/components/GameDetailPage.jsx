import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import moment from 'moment-timezone'

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

export default function GameDetailPage() {
  const { matchup } = useParams()
  const [searchParams] = useSearchParams()
  const [home, away] = (matchup || '').split('-')
  const dateParam = searchParams.get('date') || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('results')

  const apiUrl = `${API_BASE}/api/iho-game-detail?home=${home}&away=${away}${dateParam ? `&date=${dateParam}` : ''}`

  useEffect(() => {
    if (!home || !away) return
    setLoading(true)
    setError(null)
    fetch(apiUrl)
      .then(r => r.json().then(d => r.ok ? d : Promise.reject(d)))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.error || e.message || 'Failed to load'); setLoading(false) })
  }, [home, away, dateParam])

  // Poll every 30s if game is live
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
              {data.subEvent || 'Result'} {isLive ? '(Intermediate)' : isOfficial ? '(Official)' : ''}
            </span>
            <span className={`${statusColor} text-white text-xs font-bold px-2 py-0.5 rounded`}>{statusLabel}</span>
          </div>
          <div className="px-6 py-6 flex items-center justify-center gap-6 md:gap-12">
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <TeamFlag code={ht.code} />
              <span className="font-bold text-lg">{ht.name || ht.code}</span>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>Uniform: <span className="text-white">{ht.uniform || '—'}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-5xl font-black tabular-nums">{ht.score ?? 0}</span>
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  {isOfficial ? 'Final' : data.period ? data.period.replace(/^EP/, 'P') : ''}
                </span>
                <span className="text-gray-600 text-2xl">—</span>
              </div>
              <span className="text-5xl font-black tabular-nums">{at.score ?? 0}</span>
            </div>
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
              <TeamFlag code={at.code} />
              <span className="font-bold text-lg">{at.name || at.code}</span>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>Uniform: <span className="text-white">{at.uniform || '—'}</span></span>
              </div>
            </div>
          </div>
          {data.venueName && (
            <div className="px-6 pb-3 text-center text-xs text-gray-400">
              {data.venueName}{data.attendance ? ` — Attendance: ${Number(data.attendance).toLocaleString()}` : ''}
            </div>
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

        {/* Tab Content */}
        {tab === 'results' && <ResultsTab data={data} />}
        {tab === 'pbp' && <PlayByPlayTab data={data} />}
        {tab === 'stats' && <TournamentStatsTab data={data} />}
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
  const [subTab, setSubTab] = useState('overview')

  const subTabs = [
    { id: 'overview', label: 'Match Overview' },
    { id: 'home', label: `${ht.code} Boxscore`, code: ht.code },
    { id: 'away', label: `${at.code} Boxscore`, code: at.code },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === t.id ? 'bg-sky-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.code && <TeamFlag code={t.code} size="sm" />}
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && <MatchOverview data={data} />}
      {subTab === 'home' && <TeamBoxscore data={data} which="home" />}
      {subTab === 'away' && <TeamBoxscore data={data} which="away" />}
    </div>
  )
}

/* ============================== Match Overview ============================== */
function MatchOverview({ data }) {
  const ht = data.homeTeam || {}
  const at = data.awayTeam || {}
  const periods = data.periods || []

  const statCodes = ['SOG', 'GF', 'PPG', 'PK', 'PIM', 'FO', 'SVS']
  const statLabels = { SOG: 'Shots on Goal', GF: 'Goals', PPG: 'Power Play Goals', PK: 'Penalty Kill %', PIM: 'Penalties in Minutes', FO: 'Faceoffs Won', SVS: 'Saves' }
  const periodCodes = periods.map(p => p.code)

  function getTeamStat(team, code, period) {
    return team?.teamStats?.[period]?.[code]?.value ?? '—'
  }

  return (
    <div className="space-y-6">
      {/* Period scores */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left px-4 py-2 font-medium">Team</th>
              {periodCodes.map(pc => <th key={pc} className="px-3 py-2 text-center font-medium">{pc}</th>)}
              <th className="px-3 py-2 text-center font-semibold text-white">Total</th>
            </tr>
          </thead>
          <tbody>
            {[ht, at].map((team, i) => (
              <tr key={i} className="border-b border-gray-700/50 last:border-0">
                <td className="px-4 py-2 font-semibold flex items-center gap-2">
                  <TeamFlag code={team.code} size="sm" />
                  {team.code}
                </td>
                {periods.map(p => (
                  <td key={p.code} className="px-3 py-2 text-center text-gray-300">
                    {i === 0 ? p.homeScore : p.awayScore}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold text-white">{team.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Team stats per period */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left px-4 py-2 font-medium">Stat</th>
              {periodCodes.map(pc => (
                <th key={pc} className="text-center px-2 py-2 font-medium" colSpan={2}>{pc}</th>
              ))}
              <th className="text-center px-2 py-2 font-medium" colSpan={2}>Total</th>
            </tr>
            <tr className="text-gray-500 border-b border-gray-700 text-xs">
              <th />
              {[...periodCodes, 'TOT'].map(pc => (
                <React.Fragment key={pc}>
                  <th className="px-2 py-1 text-center">{ht.code}</th>
                  <th className="px-2 py-1 text-center">{at.code}</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {statCodes.map(code => (
              <tr key={code} className="border-b border-gray-700/50 last:border-0">
                <td className="px-4 py-2 text-gray-300 font-medium">{statLabels[code] || code}</td>
                {[...periodCodes, 'TOT'].map(pc => (
                  <React.Fragment key={pc}>
                    <td className="px-2 py-2 text-center text-gray-200">{getTeamStat(ht, code, pc)}</td>
                    <td className="px-2 py-2 text-center text-gray-200">{getTeamStat(at, code, pc)}</td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Officials */}
      {data.officials?.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Officials</h3>
          <p className="text-sm text-gray-300">
            {data.officials.map(o => `${o.bib ? '#' + o.bib : ''} ${o.givenName} ${o.familyName} (${o.function === 'RE' ? 'Referee' : o.function === 'LIN_MEN' ? 'Linesman' : o.function}, ${o.organisation})`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}

/* ============================== Play By Play Tab ============================== */
function PlayByPlayTab({ data }) {
  const pbp = data.playByPlay || []
  if (pbp.length === 0) return <p className="text-gray-400">No play-by-play data available.</p>

  const homeCode = data.homeTeam?.code
  const awayCode = data.awayTeam?.code
  const actionsByPeriod = {}
  for (const a of pbp) {
    const p = a.period || '?'
    if (!actionsByPeriod[p]) actionsByPeriod[p] = []
    actionsByPeriod[p].push(a)
  }
  const periodLabels = { P1: '1st Period', P2: '2nd Period', P3: '3rd Period', OT: 'Overtime', SO: 'Shootout' }
  const periodKeys = Object.keys(actionsByPeriod).sort((a, b) => {
    const order = { P1: 1, P2: 2, P3: 3, OT: 4, SO: 5 }
    return (order[a] || 99) - (order[b] || 99)
  })
  const actionIcons = { GOAL: '🚨', P: '⏱', GK: '🥅', STARTP: '▶', ENDP: '⏸' }
  const actionLabels = { GOAL: 'Goal', P: 'Penalty', GK: 'Goalkeeper change', STARTP: 'Start of period', ENDP: 'End of period' }

  return (
    <div className="space-y-6">
      {periodKeys.map(pk => (
        <div key={pk} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-amber-300 uppercase tracking-wide mb-3">{periodLabels[pk] || pk}</h3>
          <div className="space-y-2">
            {actionsByPeriod[pk].map((a, i) => {
              const isGoal = a.action === 'GOAL'
              const isPenalty = a.action === 'P'
              const isStructural = a.action === 'STARTP' || a.action === 'ENDP'
              const isGK = a.action === 'GK'
              const icon = actionIcons[a.action] || '•'
              const label = actionLabels[a.action] || a.action
              const scorer = a.players?.find(p => p.role === 'SCR')
              const assists = a.players?.filter(p => p.role === 'ASSIST1' || p.role === 'ASSIST2') || []
              const penaltyPlayer = isPenalty && a.players?.[0]
              const gkPlayer = isGK && a.players?.[0]
              const gkInOut = gkPlayer?.role === 'IN' ? '(Goalkeeper in)' : gkPlayer?.role === 'OUT' ? '(Goalkeeper out)' : ''
              const score = (a.scoreH != null && a.scoreA != null) ? `${a.scoreH}-${a.scoreA}` : ''
              const teamColor = a.team === homeCode ? 'text-blue-300' : a.team === awayCode ? 'text-red-300' : 'text-gray-400'

              if (isStructural) {
                return (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-500 py-1">
                    <span className="w-14 text-right font-mono tabular-nums">{a.when}</span>
                    <span>{icon}</span>
                    <span>{label}</span>
                  </div>
                )
              }

              return (
                <div key={i} className={`flex items-start gap-3 text-sm py-1.5 ${isGoal ? 'bg-gray-700/50 rounded px-3 -mx-1' : ''}`}>
                  <span className="w-14 text-right font-mono tabular-nums text-gray-400 pt-0.5 shrink-0">{a.when}</span>
                  <span className="shrink-0 pt-0.5">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{label}</span>
                      {isPenalty && a.description && <span className="text-gray-300">({a.description})</span>}
                      {isPenalty && a.penaltyTime && <span className="text-xs text-gray-500">Penalty time: {a.penaltyTime}</span>}
                    </div>
                    {a.team && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <TeamFlag code={a.team} size="sm" />
                        <span className={`font-semibold text-xs ${teamColor}`}>{a.team}</span>
                        {isGoal && scorer && <span className="text-white">{scorer.bib ? `#${scorer.bib}` : ''} {scorer.name}</span>}
                        {isPenalty && penaltyPlayer && <span className="text-gray-200">{penaltyPlayer.bib ? `#${penaltyPlayer.bib}` : ''} {penaltyPlayer.name}</span>}
                        {isGK && gkPlayer && <span className="text-gray-300">{gkPlayer.bib ? `#${gkPlayer.bib}` : ''} {gkPlayer.name} {gkInOut}</span>}
                      </div>
                    )}
                    {isGoal && assists.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">Assists: {assists.map(a => `${a.name}${a.bib ? ` #${a.bib}` : ''}`).join(', ')}</p>
                    )}
                    {isGoal && score && <span className="text-xs text-amber-300 font-semibold">{score}</span>}
                    {isGoal && a.result && <span className="text-xs text-gray-500 ml-2">{a.result === 'PP1' ? 'Power Play' : a.result === 'SH1' ? 'Shorthanded' : a.result === 'EQ' ? 'Even Strength' : a.result}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============================== Team Boxscore (sub-tab of Results) ============================== */
function TeamBoxscore({ data, which }) {
  const team = which === 'home' ? (data.homeTeam || {}) : (data.awayTeam || {})

  return (
    <div className="space-y-4">
      {/* Coaches */}
      {team.coaches?.length > 0 && (
        <p className="text-xs text-gray-400">
          Coaches: {team.coaches.map(c => `${c.givenName} ${c.familyName} (${c.function === 'COACH' ? 'Head Coach' : c.function === 'AST_COA' ? 'Assistant Coach' : c.function})`).join(', ')}
        </p>
      )}

      {/* Goalkeepers */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <div className="px-4 py-2 border-b border-gray-700">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Goalkeepers</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700 text-xs">
              <th className="px-3 py-2 text-left w-10">#</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-center">MIN</th>
              <th className="px-3 py-2 text-center">GS</th>
              <th className="px-3 py-2 text-center">GS%</th>
              <th className="px-3 py-2 text-center">GA</th>
              <th className="px-3 py-2 text-center">PTY</th>
              <th className="px-3 py-2 text-center">PIM</th>
            </tr>
          </thead>
          <tbody>
            {(team.goalkeepers || []).map((gk, i) => (
              <tr key={i} className="border-b border-gray-700/50 last:border-0">
                <td className="px-3 py-2 text-gray-400 font-mono">{gk.bib}</td>
                <td className="px-3 py-2 font-medium">{gk.familyName}, {gk.givenName}</td>
                <td className="px-3 py-2 text-center text-gray-300 font-mono">{gk.mins}</td>
                <td className="px-3 py-2 text-center text-gray-300">{gk.svs ?? '—'}{gk.svsAttempt ? `/${gk.svsAttempt}` : ''}</td>
                <td className="px-3 py-2 text-center text-gray-300">{gk.svsPct ? `${Number(gk.svsPct).toFixed(2)}%` : '—'}</td>
                <td className="px-3 py-2 text-center text-gray-300">{gk.ga}</td>
                <td className="px-3 py-2 text-center text-gray-300">{gk.pty}</td>
                <td className="px-3 py-2 text-center text-gray-300">{gk.pim}</td>
              </tr>
            ))}
            {(!team.goalkeepers || team.goalkeepers.length === 0) && (
              <tr><td colSpan={8} className="px-3 py-2 text-gray-500 text-center">No goalie data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Outfield Players */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <div className="px-4 py-2 border-b border-gray-700">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Outfield Players</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700 text-xs">
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-center">Pos</th>
              <th className="px-2 py-2 text-center">MIN</th>
              <th className="px-2 py-2 text-center">GF</th>
              <th className="px-2 py-2 text-center">SOG</th>
              <th className="px-2 py-2 text-center">FOW</th>
              <th className="px-2 py-2 text-center">FOL</th>
              <th className="px-2 py-2 text-center">AST</th>
              <th className="px-2 py-2 text-center">PTS</th>
              <th className="px-2 py-2 text-center">PTY</th>
              <th className="px-2 py-2 text-center">PIM</th>
              <th className="px-2 py-2 text-center">SHF</th>
              <th className="px-2 py-2 text-center">+/-</th>
            </tr>
          </thead>
          <tbody>
            {(team.players || []).map((p, i) => (
              <tr key={i} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30">
                <td className="px-2 py-1.5 text-gray-400 font-mono">{p.bib}</td>
                <td className="px-2 py-1.5 font-medium whitespace-nowrap">{p.familyName}, {p.givenName}</td>
                <td className="px-2 py-1.5 text-center text-gray-400">{p.position}</td>
                <td className="px-2 py-1.5 text-center text-gray-300 font-mono">{p.mins}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.gf}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.sog}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.fo}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.foLost}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.assists}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.pts}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.pty}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.pim}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.shifts}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{p.plusMinus}</td>
              </tr>
            ))}
            {(!team.players || team.players.length === 0) && (
              <tr><td colSpan={14} className="px-3 py-2 text-gray-500 text-center">No player data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============================== Tournament Stats Tab ============================== */
const TEAM_STAT_CATS = [
  { id: 'GF', label: 'Goals', group: 'Percent Rankings', cols: ['Matches', 'Made', 'Attempts', '%'] },
  { id: 'PP', label: 'Power Play Goals', group: 'Percent Rankings', cols: ['Matches', 'Made', 'Attempts', '%'] },
  { id: 'PK', label: 'Penalty Kill', group: 'Percent Rankings', cols: ['Matches', 'Against', 'Attempts', '%'] },
  { id: 'GK', label: 'Saves', group: 'Percent Rankings', cols: ['Matches', 'Saves', 'Attempts', '%'] },
  { id: 'SHG_NET', label: 'Shorthanded Goals Diff', group: 'Total Rankings', cols: ['Matches', 'Value'] },
  { id: 'PIM', label: 'Penalties in Minutes', group: 'Total Rankings', cols: ['Matches', 'Value', 'Avg'] },
  { id: 'ATTENDANCE', label: 'Attendance', group: 'Per Game Rankings', cols: ['Matches', 'Total', 'Avg'] },
]

const IND_STAT_CATS = [
  { id: 'GF', label: 'Goals', group: 'Total Rankings', cols: ['Matches', 'Goals', 'SOG', '%'] },
  { id: 'ASSIST', label: 'Assists', group: 'Total Rankings', cols: ['Matches', 'Assists'] },
  { id: 'PTS', label: 'Points', group: 'Total Rankings', cols: ['Matches', 'Points'] },
  { id: 'SOG', label: 'Shots on Goal', group: 'Total Rankings', cols: ['Matches', 'SOG', 'Avg'] },
  { id: 'PLUS_MINUS', label: 'Plus / Minus', group: 'Total Rankings', cols: ['Matches', '+/-'] },
  { id: 'PIM', label: 'Penalties in Minutes', group: 'Total Rankings', cols: ['Matches', 'PIM', 'Avg'] },
  { id: 'GK', label: 'Goalkeeper Saves', group: 'Percent Rankings', cols: ['Matches', 'Saves', 'Attempts', '%'] },
  { id: 'MINS', label: 'Minutes on Ice', group: 'Per Game Rankings', cols: ['Matches', 'Total', 'Avg'] },
]

function TournamentStatsTab({ data }) {
  const ts = data.tournamentStats
  const [mode, setMode] = useState('teams')
  const [teamCat, setTeamCat] = useState('GF')
  const [indCat, setIndCat] = useState('GF')

  if (!ts) return <p className="text-gray-400">No tournament stats available.</p>

  const cat = mode === 'teams' ? TEAM_STAT_CATS.find(c => c.id === teamCat) : IND_STAT_CATS.find(c => c.id === indCat)
  const catId = cat?.id || 'GF'
  const cats = mode === 'teams' ? TEAM_STAT_CATS : IND_STAT_CATS
  const setCat = mode === 'teams' ? setTeamCat : setIndCat

  return (
    <div className="space-y-4">
      {/* Mode toggle + category dropdown */}
      <div className="flex flex-wrap items-center gap-3">
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
        <select
          value={catId}
          onChange={e => setCat(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
        >
          {(() => {
            const groups = {}
            cats.forEach(c => { if (!groups[c.group]) groups[c.group] = []; groups[c.group].push(c) })
            return Object.entries(groups).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
            ))
          })()}
        </select>
      </div>

      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide text-center">
        {mode === 'teams' ? 'Team' : 'Individual'} Ranking: {cat?.label}
      </h3>

      {mode === 'teams' ? (
        <TeamRankingTable teams={ts.teamRanking || []} catId={catId} cat={cat} />
      ) : (
        <IndRankingTable players={ts.indRanking || []} catId={catId} cat={cat} />
      )}
    </div>
  )
}

function TeamRankingTable({ teams, catId, cat }) {
  const sorted = [...teams].sort((a, b) => {
    const sa = a.stats[catId]?.sortOrder ?? 999
    const sb = b.stats[catId]?.sortOrder ?? 999
    return sa - sb
  })

  function getCells(t) {
    const s = t.stats[catId] || {}
    const mp = t.stats.MP?.value || '0'
    switch (catId) {
      case 'GF': case 'PP': return [mp, s.value ?? '—', s.attempt ?? '—', s.percent != null ? s.percent + '%' : '—']
      case 'PK': return [mp, s.value ?? '—', s.attempt ?? '—', s.percent != null ? s.percent + '%' : '—']
      case 'GK': return [mp, s.value ?? '—', s.attempt ?? '—', s.percent != null ? s.percent + '%' : '—']
      case 'SHG_NET': return [mp, s.value ?? '—']
      case 'PIM': return [mp, s.value ?? '—', s.avg ?? '—']
      case 'ATTENDANCE': return [mp, s.value ?? '—', s.avg ?? '—']
      default: return [mp, s.value ?? '—']
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700 text-xs">
            <th className="px-3 py-2 text-center w-14">Rank</th>
            <th className="px-3 py-2 text-left">Team</th>
            {cat?.cols.map(c => <th key={c} className="px-3 py-2 text-center">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <tr key={i} className="border-b border-gray-700/50 last:border-0">
              <td className="px-3 py-2 text-center text-gray-400 font-medium">{t.stats[catId]?.rank ?? '—'}</td>
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <TeamFlag code={t.teamCode} size="sm" />
                  {t.teamName || t.teamCode}
                </div>
              </td>
              {getCells(t).map((v, j) => (
                <td key={j} className={`px-3 py-2 text-center ${j === getCells(t).length - 1 ? 'font-bold text-white' : 'text-gray-300'}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IndRankingTable({ players, catId, cat }) {
  const isGK = catId === 'GK'
  const filtered = isGK ? players.filter(p => p.position === 'GK') : players
  const sorted = [...filtered]
    .filter(p => p.stats[catId]?.sortOrder != null)
    .sort((a, b) => (a.stats[catId]?.sortOrder ?? 999) - (b.stats[catId]?.sortOrder ?? 999))
    .slice(0, 50)

  function getCells(p) {
    const s = p.stats[catId] || {}
    const mp = p.stats.MP?.value || '0'
    switch (catId) {
      case 'GF': return [mp, s.value ?? '—', s.attempt ?? '—', s.percent != null ? s.percent + '%' : '—']
      case 'ASSIST': return [mp, s.value ?? '—']
      case 'PTS': return [mp, s.value ?? '—']
      case 'SOG': return [mp, s.value ?? '—', s.avg ?? '—']
      case 'PLUS_MINUS': return [mp, s.value ?? '—']
      case 'PIM': return [mp, s.value ?? '—', s.avg ?? '—']
      case 'GK': return [mp, s.value ?? '—', s.attempt ?? '—', s.percent != null ? s.percent + '%' : '—']
      case 'MINS': return [mp, s.value ?? '—', s.avg ?? '—']
      default: return [mp, s.value ?? '—']
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700 text-xs">
            <th className="px-3 py-2 text-center w-14">Rank</th>
            <th className="px-3 py-2 text-center w-16">NOC</th>
            <th className="px-3 py-2 text-left">Name</th>
            {cat?.cols.map(c => <th key={c} className="px-3 py-2 text-center">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const rank = p.stats[catId]?.rank
            const rankStr = rank != null ? (p.stats[catId]?.RANK_EQUAL || sorted[i - 1]?.stats[catId]?.rank === rank ? '=' + rank : String(rank)) : '—'
            return (
              <tr key={i} className="border-b border-gray-700/50 last:border-0">
                <td className="px-3 py-2 text-center text-gray-400 font-medium">{rankStr}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center gap-1.5 justify-center">
                    <TeamFlag code={p.teamCode} size="sm" />
                    <span className="text-xs text-gray-400">{p.teamCode}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{p.familyName}, {p.givenName}</td>
                {getCells(p).map((v, j) => (
                  <td key={j} className={`px-3 py-2 text-center ${j === getCells(p).length - 1 ? 'font-bold text-white' : 'text-gray-300'}`}>{v}</td>
                ))}
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={3 + (cat?.cols.length || 0)} className="px-3 py-4 text-gray-500 text-center">No data available</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ============================== Pool Standing Tab ============================== */
const GROUP_LABELS = { GPA: 'Group A', GPB: 'Group B', GPC: 'Group C', GPD: 'Group D', PREL: 'Combined' }

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
  const isCombined = active?.groupCode === 'PREL'

  return (
    <div className="space-y-5">
      {/* Group tabs */}
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

      {/* Standings table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700 text-[10px] uppercase tracking-wider">
              <th rowSpan={2} className="px-3 py-1 text-center w-10">Rk</th>
              <th rowSpan={2} className="px-3 py-1 text-left">Team</th>
              <th colSpan={3} className="px-2 py-1 text-center border-b border-gray-700/50">Matches</th>
              <th colSpan={2} className="px-2 py-1 text-center border-b border-gray-700/50">Overtime</th>
              <th colSpan={3} className="px-2 py-1 text-center border-b border-gray-700/50">Goals</th>
              <th rowSpan={2} className="px-3 py-1 text-center">Pts</th>
            </tr>
            <tr className="text-gray-500 border-b border-gray-700 text-[10px]">
              <th className="px-2 py-1 text-center">Pld</th>
              <th className="px-2 py-1 text-center">W</th>
              <th className="px-2 py-1 text-center">L</th>
              <th className="px-2 py-1 text-center">W</th>
              <th className="px-2 py-1 text-center">L</th>
              <th className="px-2 py-1 text-center">For</th>
              <th className="px-2 py-1 text-center">Agt</th>
              <th className="px-2 py-1 text-center">Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const isHighlighted = s.teamCode === data.homeTeam?.code || s.teamCode === data.awayTeam?.code
              return (
                <tr key={i} className={`border-b border-gray-700/50 last:border-0 ${isHighlighted ? 'bg-sky-900/30' : ''}`}>
                  <td className="px-3 py-2 text-center text-gray-400 font-medium">{s.rank}{isCombined && s.rank ? 'D' : ''}</td>
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <TeamFlag code={s.teamCode} size="sm" />
                      {s.teamCode}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.played}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.won}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.lost}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.otw}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.otl}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.goalsFor}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.goalsAgainst}</td>
                  <td className="px-2 py-2 text-center text-gray-300">{s.diff}</td>
                  <td className="px-2 py-2 text-center font-bold text-white">{s.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Matches for this group (IIHF convention: away team on left) */}
      {!isCombined && (() => {
        const seen = new Set()
        const matches = []
        for (const s of standings) {
          for (const o of (s.opponents || [])) {
            const pair = [s.teamCode, o.teamCode].sort().join('-')
            const key = `${pair}-${o.date}`
            if (seen.has(key)) continue
            seen.add(key)
            const sIsAway = o.homeAway === 'A'
            const rawScores = o.result ? o.result.replace(/\s*OT$/, '').split('-').map(x => x.trim()) : ['—', '—']
            const leftTeam = sIsAway ? s : { teamCode: o.teamCode, teamName: o.teamName }
            const rightTeam = sIsAway ? { teamCode: o.teamCode, teamName: o.teamName } : s
            const leftScore = sIsAway ? rawScores[0] : rawScores[1]
            const rightScore = sIsAway ? rawScores[1] : rawScores[0]
            const isOT = o.result?.includes('OT')
            matches.push({ key, date: o.date, time: o.time, leftTeam, rightTeam, leftScore, rightScore, isOT })
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
                    <div className="flex flex-col items-center min-w-[60px]">
                      {m.isOT && <span className="text-[10px] text-gray-500 uppercase">(Overtime)</span>}
                      <span className="text-lg font-bold text-white tabular-nums">{m.leftScore} - {m.rightScore}</span>
                    </div>
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

  const roundLabels = { QFNL: 'Quarterfinals', SFNL: 'Semifinals', 'BRO-': 'Bronze Medal Game', FNL: 'Gold Medal Game' }

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
