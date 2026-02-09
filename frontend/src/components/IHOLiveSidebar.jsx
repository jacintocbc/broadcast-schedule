import { useState, useEffect } from 'react'
import moment from 'moment-timezone'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const FLAG_CODE_OVERRIDES = { ROM: 'ROU', FIJ: 'FJI', LBN: 'LIB', SGP: 'SIN' }
function getFlagSrc(countryCode) {
  if (!countryCode) return null
  const code = FLAG_CODE_OVERRIDES[countryCode] || countryCode
  return `/flags/${code}.jpg`
}

/** Compact stat row */
function StatRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  )
}

/** Team flag for scoreboard */
function TeamFlag({ code }) {
  const src = getFlagSrc(code)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-14 object-cover rounded-sm flex-shrink-0"
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}

/** Extract two IOC team codes from block/event name (e.g. GER-FRA, GER vs FRA). */
function extractTeamCodes(block) {
  const name = (block?.name || block?.title || '').toUpperCase()
  if (!name) return null
  const exclude = new Set(['IHO', 'OBS', 'CBC', 'TV', 'RC', 'GPB', 'GPA'])
  const matches = name.match(/\b([A-Z]{3})\b/g) || []
  const codes = [...new Set(matches)].filter(c => !exclude.has(c))
  if (codes.length >= 2) return { home: codes[0], away: codes[1] }
  return null
}

/** Normalize period display: EP2 -> P2, EP1 -> P1, etc. */
function formatPeriod(period) {
  if (!period || typeof period !== 'string') return period
  return period.replace(/^EP/i, 'P')
}

/** Format seconds as M:SS */
function formatGameTime(seconds) {
  if (seconds == null || seconds < 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Scorers list for one team */
function ScorersList({ scorers, teamName }) {
  if (!scorers || scorers.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{teamName}</p>
      <ul className="space-y-0.5">
        {scorers.map((s, i) => (
          <li key={i} className="text-sm text-gray-200 flex justify-between gap-2">
            <span className="truncate">{s.name}</span>
            <span className="text-gray-400 shrink-0">
              {s.goals > 0 && `${s.goals}G`}
              {s.goals > 0 && s.assists > 0 && ' '}
              {s.assists > 0 && `${s.assists}A`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function IHOLiveSidebar({ open, onClose, block }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const teamCodes = extractTeamCodes(block)

  useEffect(() => {
    if (!open) return

    setLoading(true)

    const fetchData = async () => {
      try {
        setError(null)
        const params = new URLSearchParams()
        if (teamCodes) {
          params.set('home', teamCodes.home)
          params.set('away', teamCodes.away)
        }
        const url = `${API_BASE}/api/iho-live${params.toString() ? '?' + params.toString() : ''}`
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) {
          setError(json.error || json.details || 'Failed to load')
          setData(null)
          return
        }
        setData(json)
      } catch (err) {
        setError(err.message || 'Network error')
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [open, teamCodes?.home, teamCodes?.away])

  if (!open) return null

  return (
    <>
      <div
        className="fixed top-[73px] right-0 bottom-0 left-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-[73px] right-0 bottom-0 w-[min(28rem,100vw)] bg-gray-800 border-l border-gray-600 z-50 flex flex-col shadow-xl"
        role="dialog"
        aria-label="Live Ice Hockey"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-600 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Live Ice Hockey</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {loading && !data && (
            <div className="flex items-center justify-center py-12 text-gray-400">Loading…</div>
          )}
          {error && !data && (
            <div className="rounded-lg bg-gray-700 p-4 text-red-400 border border-red-500/30">
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}
          {data && (
            <>
              {/* Last updated */}
              <div className="rounded-lg bg-gray-700 px-4 py-3 border border-gray-600">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Last updated</span>
                  <span className="text-base font-semibold text-white font-mono">
                    {data.lastUpdated ? moment(data.lastUpdated).tz('America/New_York').format('h:mm:ss A') : '—'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Eastern Time</p>
              </div>

              {/* Scoreboard: [GER flag] GER [1] – [0] FRA [FRA flag] + game clock */}
              <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                {(data.eventName || data.subEvent) && (
                  <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 mb-3 text-sm text-gray-300">
                    {data.eventName && <span>{data.eventName}</span>}
                    {data.eventName && data.subEvent && <span className="text-gray-500">·</span>}
                    {data.subEvent && <span>{data.subEvent}</span>}
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <TeamFlag code={data.homeTeam?.code} />
                  <span className="font-semibold text-white truncate min-w-0">{data.homeTeam?.code ?? '—'}</span>
                  <span className="text-4xl font-bold text-white tabular-nums shrink-0">{data.homeTeam?.score ?? '—'}</span>
                  <span className="text-gray-500 text-2xl font-medium shrink-0">–</span>
                  <span className="text-4xl font-bold text-white tabular-nums shrink-0">{data.awayTeam?.score ?? '—'}</span>
                  <span className="font-semibold text-white truncate min-w-0 text-right">{data.awayTeam?.code ?? '—'}</span>
                  <TeamFlag code={data.awayTeam?.code} />
                </div>
                {(data.timeRemainingInPeriod != null || data.timeRemainingGame != null || data.period) && (
                  <div className="mt-3 pt-3 border-t border-gray-600 flex justify-center items-center gap-4 flex-wrap">
                    {data.period && (
                      <span className="text-amber-200 font-semibold text-base">
                        {formatPeriod(data.period)}
                        {data.timeRemainingInPeriod != null && (
                          <span className="text-white font-mono"> · {formatGameTime(data.timeRemainingInPeriod)} left</span>
                        )}
                      </span>
                    )}
                    {(data.timeRemainingGame != null || data.resultStatus === 'OFFICIAL') && (
                      <span className="text-amber-200 font-semibold text-base">
                        {data.resultStatus === 'OFFICIAL' ? (
                          <span className="text-white">Final</span>
                        ) : (data.period || '').toUpperCase() === 'OT' ? (
                          <span className="text-white">OT</span>
                        ) : (
                          <span className="text-white font-mono">{formatGameTime(data.timeRemainingGame)} game remaining</span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Team stats */}
              <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Team Stats</p>
                <div className="grid grid-cols-2 gap-4">
                  {[data.homeTeam, data.awayTeam].filter(Boolean).map((team, i) => (
                    <div key={team.code || i} className="space-y-2">
                      <p className="text-sm font-medium text-white truncate">{team.name}</p>
                      <div className="space-y-1">
                        <StatRow label="SOG" value={team.sog} />
                        <StatRow label="GF" value={team.gf} />
                        {team.foPercent != null && <StatRow label="FO%" value={`${team.foPercent}%`} />}
                        {team.ppg != null && team.ppg > 0 && <StatRow label="PPG" value={team.ppg} />}
                        {team.pim != null && team.pim > 0 && <StatRow label="PIM" value={team.pim} />}
                        {team.svs != null && team.svs > 0 && <StatRow label="SVS" value={team.svs} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scoring summary */}
              {(data.homeScorers?.length > 0 || data.awayScorers?.length > 0) && (
                <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Scoring Summary</p>
                  <div className="grid grid-cols-2 gap-4">
                    <ScorersList scorers={data.homeScorers} teamName={data.homeTeam?.name} />
                    <ScorersList scorers={data.awayScorers} teamName={data.awayTeam?.name} />
                  </div>
                </div>
              )}

              {/* Period scores */}
              {data.periods && data.periods.length > 0 && (
                <div className="rounded-lg bg-gray-700/60 px-4 py-3 border border-gray-600">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Period Scores</p>
                  <div className="flex gap-4">
                    {data.periods.map((p, i) => (
                      <span key={i} className="text-sm text-gray-300">
                        {p.code}: {p.homeScore}–{p.awayScore}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
