import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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

/** Detect sport from block name. */
function detectSport(block) {
  const name = (block?.name || block?.title || '').toLowerCase()
  if (/cur|curling/.test(name)) return 'CUR'
  if (/iho|ice hockey/.test(name)) return 'IHO'
  if (/lug|luge/.test(name)) return 'LUG'
  if (/stk|short track/.test(name)) return 'STK'
  if (/ssk|speed skating|speed ?skat/.test(name)) return 'SSK'
  if (/sbd|snowboard/.test(name)) return 'SBD'
  return null
}

/** Extract two IOC team codes from block/event name (e.g. GER-FRA, ITA-USA). */
function extractTeamCodes(block) {
  const name = (block?.name || block?.title || '').toUpperCase()
  if (!name) return null
  const exclude = new Set(['IHO', 'CUR', 'OBS', 'CBC', 'TV', 'RC', 'GPB', 'GPA', 'SSK', 'STK', 'SBD'])
  const matches = name.match(/\b([A-Z]{3})\b/g) || []
  const codes = [...new Set(matches)].filter(c => !exclude.has(c))
  if (codes.length >= 2) return { home: codes[0], away: codes[1] }
  return null
}

/** Normalize period display: EP2 -> P2, EP1 -> P1, etc. For curling: "6" -> "End 6". */
function formatPeriod(period, sport) {
  if (!period || typeof period !== 'string') return period
  if (sport === 'CUR') return /^\d+$/.test(period) ? `End ${period}` : period
  return period.replace(/^EP/i, 'P')
}

/** Abbreviate long team names for display (e.g. United States of America -> USA). */
function formatTeamName(name, code) {
  if (!name) return code || '—'
  const n = name.trim()
  if (/^united states of america$/i.test(n)) return 'USA'
  if (/^united states$/i.test(n)) return code || 'USA'
  return name
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

export default function IHOLiveSidebar({ open, onClose, block, hasLiveIhoOrCur = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const sport = detectSport(block)
  const teamCodes = extractTeamCodes(block)
  const apiPath = sport === 'LUG' ? '/api/lug-live' : sport === 'SSK' ? '/api/ssk-live' : sport === 'STK' ? '/api/stk-live' : sport === 'SBD' ? '/api/sbd-live' : sport === 'CUR' ? '/api/cur-live' : '/api/iho-live'

  useEffect(() => {
    if (!open || !sport) return

    setData(null)
    setError(null)
    setLoading(true)

    const fetchData = async () => {
      try {
        setError(null)
        const params = new URLSearchParams()
        if (teamCodes && sport !== 'LUG' && sport !== 'SSK' && sport !== 'STK' && sport !== 'SBD') {
          params.set('home', teamCodes.home)
          params.set('away', teamCodes.away)
        }
        const url = `${API_BASE}${apiPath}${params.toString() ? '?' + params.toString() : ''}`
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
    const pollMs = hasLiveIhoOrCur ? 30 * 1000 : 30 * 60 * 1000
    const interval = setInterval(fetchData, pollMs)
    return () => clearInterval(interval)
  }, [open, sport, apiPath, teamCodes?.home, teamCodes?.away, block?.id, hasLiveIhoOrCur])

  if (!open) return null

  const isLive = data?.resultStatus === 'LIVE'
  const isUpcoming = !isLive && data?.resultStatus !== 'OFFICIAL'
  const title = sport === 'LUG' ? 'Luge' : sport === 'SSK' ? 'Speed Skating' : sport === 'STK' ? 'Short Track' : sport === 'SBD' ? 'Snowboard' : isLive ? (sport === 'CUR' ? 'Live Curling' : 'Live Ice Hockey') : (sport === 'CUR' ? 'Curling' : 'Ice Hockey')

  return (
    <>
      <div
        className="fixed top-[73px] right-0 bottom-0 left-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-[73px] right-0 bottom-0 w-[min(34rem,100vw)] bg-gray-800 border-l border-gray-600 z-50 flex flex-col shadow-xl"
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-600 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">{title}</h2>
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
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-2 border-gray-500 border-t-amber-400 rounded-full animate-spin" aria-hidden />
              <p className="text-sm text-gray-400">Loading…</p>
            </div>
          )}
          {error && !data && (
            <div className="rounded-lg bg-gray-700 p-4 text-red-400 border border-red-500/30">
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}
          {data && (() => {
            const effectiveSport = data.sport || sport;
            if (sport === 'SBD') {
              const runs = data.runs || [];
              const runSchedule = data.runSchedule || [];
              const hasNonOfficial = runs.some(r => r.resultStatus !== 'OFFICIAL');
              return (
                <>
                  {hasNonOfficial && data.lastUpdated && (
                    <div className="rounded-lg bg-gray-700 px-4 py-3 border border-gray-600">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Last updated</span>
                        <span className="text-base font-semibold text-white font-mono">
                          {moment(data.lastUpdated).tz('America/New_York').format('h:mm:ss A')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Eastern Time</p>
                    </div>
                  )}
                  {data.eventName && (
                    <div className="text-center text-sm font-semibold text-gray-200 mt-1 mb-2">{data.eventName}</div>
                  )}
                  {/* Run schedule/timing */}
                  {runSchedule.length > 0 && (
                    <div className="rounded-lg bg-gray-700 p-3 border border-gray-600 mb-4">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Run Schedule</div>
                      <div className="space-y-1.5">
                        {runSchedule.map((rs, i) => {
                          const start = rs.startDate ? moment(rs.startDate).tz('America/New_York').format('h:mm A') : '';
                          const end = rs.endDate ? moment(rs.endDate).tz('America/New_York').format('h:mm A') : '';
                          const statusColor = rs.status === 'RUNNING' ? 'text-green-400' : rs.status === 'FINISHED' ? 'text-gray-400' : 'text-yellow-400';
                          const statusLabel = rs.status === 'RUNNING' ? 'Live' : rs.status === 'FINISHED' ? 'Done' : rs.status === 'GETTING_READY' ? 'Next' : rs.status || '';
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-200">{rs.name || `Run ${i + 1}`}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-mono">{start}{end ? ` – ${end}` : ''}</span>
                                <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Overall / cumulative standings (DT_PHASE_RESULT) */}
                  {data.phaseResults && data.phaseResults.results?.length > 0 && (
                    <div className="rounded-lg bg-gray-700 p-4 border border-amber-500/40 mb-4">
                      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 mb-3 text-sm text-gray-300">
                        {data.phaseResults.resultStatus === 'OFFICIAL' && <span className="text-amber-200 font-semibold">Official</span>}
                        {data.phaseResults.resultStatus === 'LIVE' && <span className="text-green-400 font-semibold">Live</span>}
                        <span className="text-gray-500">·</span>
                        <span>Overall Standings</span>
                      </div>
                      <div className="border-b border-gray-600 mb-1" aria-hidden />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {data.phaseResults.results.map((row, i) => (
                              <tr key={i} className="border-b border-gray-600/50 text-gray-200 align-top">
                                <td className="py-1.5 pr-2 font-medium text-white whitespace-nowrap">{row.rank}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.organisation && (
                                    <img src={getFlagSrc(row.organisation)} alt="" className="h-5 w-7 object-cover object-center rounded-sm" onError={e => { e.target.style.display = 'none' }} />
                                  )}
                                </td>
                                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.organisation || '—'}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.displayName || [row.givenName, row.familyName].filter(Boolean).join(' ') || '—'}
                                </td>
                                <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-white">{row.result || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {/* Per-run results */}
                  {runs.map((runBlock, runIdx) => (
                    <div key={`sbd-run-${runIdx}`} className="rounded-lg bg-gray-700 p-4 border border-gray-600 mb-4 last:mb-0">
                      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 mb-3 text-sm text-gray-300">
                        {runBlock.resultStatus === 'OFFICIAL' && <span className="text-amber-200 font-semibold">Official</span>}
                        {runBlock.resultStatus === 'LIVE' && <span className="text-green-400 font-semibold">Live</span>}
                        {runBlock.subEventName && (
                          <>
                            <span className="text-gray-500">·</span>
                            <span>{runBlock.subEventName}</span>
                          </>
                        )}
                      </div>
                      <div className="border-b border-gray-600 mb-1" aria-hidden />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {(runBlock.results || []).map((row, i) => (
                              <tr key={i} className="border-b border-gray-600/50 text-gray-200 align-top">
                                <td className="py-1.5 pr-2 font-medium text-white whitespace-nowrap">{row.rank}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.organisation && (
                                    <img src={getFlagSrc(row.organisation)} alt="" className="h-5 w-7 object-cover object-center rounded-sm" onError={e => { e.target.style.display = 'none' }} />
                                  )}
                                </td>
                                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.organisation || '—'}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.displayName || [row.givenName, row.familyName].filter(Boolean).join(' ') || '—'}
                                </td>
                                <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold">{row.result || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </>
              );
            }
            if (sport === 'LUG' || sport === 'SSK' || sport === 'STK') {
              const runs = data.runs || [];
              const hasNonOfficial = runs.some(r => r.resultStatus !== 'OFFICIAL');
              return (
                <>
                  {hasNonOfficial && data.lastUpdated && (
                    <div className="rounded-lg bg-gray-700 px-4 py-3 border border-gray-600">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Last updated</span>
                        <span className="text-base font-semibold text-white font-mono">
                          {moment(data.lastUpdated).tz('America/New_York').format('h:mm:ss A')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Eastern Time</p>
                    </div>
                  )}
                  {/* For STK: group runs by event name (e.g. Women's 500m, Men's 1000m) */}
                  {/* For LUG/SSK: show overall event name as before */}
                  {sport === 'STK' ? (() => {
                    // Group runs by eventName
                    const groups = [];
                    let currentGroup = null;
                    for (const run of runs) {
                      const evName = run.eventName || '';
                      if (!currentGroup || currentGroup.eventName !== evName) {
                        currentGroup = { eventName: evName, runs: [] };
                        groups.push(currentGroup);
                      }
                      currentGroup.runs.push(run);
                    }
                    return groups.map((group, gi) => (
                      <div key={`stk-group-${gi}`}>
                        {group.eventName && (
                          <div className="text-center text-sm font-semibold text-gray-200 mt-2 mb-2">{group.eventName}</div>
                        )}
                        {group.runs.map((runBlock, runIdx) => (
                          <div key={`stk-run-${gi}-${runIdx}`} className="rounded-lg bg-gray-700 p-4 border border-gray-600 mb-4 last:mb-0">
                            <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 mb-3 text-sm text-gray-300">
                              {runBlock.resultStatus === 'OFFICIAL' && <span className="text-amber-200 font-semibold">Official</span>}
                              {runBlock.resultStatus === 'START_LIST' && <span className="text-amber-200 font-semibold">Start List</span>}
                              {runBlock.resultStatus === 'LIVE' && <span className="text-green-400 font-semibold">Live</span>}
                              {runBlock.subEventName && (
                                <>
                                  <span className="text-gray-500">·</span>
                                  <span>{runBlock.subEventName}</span>
                                </>
                              )}
                            </div>
                            <div className="border-b border-gray-600 mb-1" aria-hidden />
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <tbody>
                                  {(runBlock.results || []).map((row, i) => (
                                    <tr key={i} className="border-b border-gray-600/50 text-gray-200 align-top">
                                      <td className="py-1.5 pr-2 font-medium text-white whitespace-nowrap">{row.rank}</td>
                                      <td className="py-1.5 pr-2 whitespace-nowrap">
                                        {row.organisation && (
                                          <img src={getFlagSrc(row.organisation)} alt="" className="h-5 w-7 object-cover object-center rounded-sm" onError={e => { e.target.style.display = 'none' }} />
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.organisation || '—'}</td>
                                      <td className="py-1.5 pr-2 whitespace-nowrap">
                                        {row.displayName || [row.givenName, row.familyName].filter(Boolean).join(' ') || '—'}
                                      </td>
                                      <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap">{row.result || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })() : (
                  <>
                  {data.eventName && (
                    <div className="text-center text-sm text-gray-300 mb-2">{data.eventName}</div>
                  )}
                  {runs.map((runBlock, runIdx) => (
                    <div key={`${sport}-run-${runIdx}`} className="rounded-lg bg-gray-700 p-4 border border-gray-600 mb-4 last:mb-0">
                      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 mb-3 text-sm text-gray-300">
                        {runBlock.resultStatus === 'OFFICIAL' && <span className="text-amber-200 font-semibold">Final</span>}
                        {runBlock.resultStatus === 'START_LIST' && <span className="text-amber-200 font-semibold">Pre-Run</span>}
                        {runBlock.subEventName && runBlock.subEventName !== data.eventName && (
                          <>
                            {(runBlock.resultStatus === 'OFFICIAL' || runBlock.resultStatus === 'START_LIST') && <span className="text-gray-500">·</span>}
                            <span>{runBlock.subEventName}</span>
                          </>
                        )}
                      </div>
                      <div className="border-b border-gray-600 mb-1" aria-hidden />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {(runBlock.results || []).map((row, i) => (
                              <tr key={i} className="border-b border-gray-600/50 text-gray-200 align-top">
                                <td className="py-1.5 pr-2 font-medium text-white whitespace-nowrap">{row.rank}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.organisation && (
                                    <img src={getFlagSrc(row.organisation)} alt="" className="h-5 w-7 object-cover object-center rounded-sm" onError={e => { e.target.style.display = 'none' }} />
                                  )}
                                </td>
                                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.organisation || '—'}</td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {row.displayName ? (
                                    row.displayName.includes('/') ? (
                                      <span className="block">
                                        {row.displayName.split(/\s*\/\s*/).map((name, j) => (
                                          <span key={j} className="block">{name.trim()}</span>
                                        ))}
                                      </span>
                                    ) : (
                                      <span>{row.displayName}</span>
                                    )
                                  ) : (
                                    <span>{[row.givenName, row.familyName].filter(Boolean).join(' ') || '—'}</span>
                                  )}
                                </td>
                                <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap">{row.result || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  </>
                  )}
                </>
              );
            }
            return (
            <>
              {/* Last updated (hide for archived final results) */}
              {data.resultStatus !== 'OFFICIAL' && (
                <div className="rounded-lg bg-gray-700 px-4 py-3 border border-gray-600">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Last updated</span>
                    <span className="text-base font-semibold text-white font-mono">
                      {data.lastUpdated ? moment(data.lastUpdated).tz('America/New_York').format('h:mm:ss A') : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Eastern Time</p>
                </div>
              )}

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
                {(data.timeRemainingInPeriod != null || data.timeRemainingGame != null || data.period || data.resultStatus === 'OFFICIAL') && (
                  <div className="mt-3 pt-3 border-t border-gray-600 flex justify-center items-center gap-4 flex-wrap">
                    {(data.period || data.resultStatus === 'START_LIST') && data.resultStatus !== 'OFFICIAL' && (
                      <span className="text-amber-200 font-semibold text-base">
                        {data.resultStatus === 'START_LIST' ? 'Pre-Game' : formatPeriod(data.period, effectiveSport)}
                        {data.timeRemainingInPeriod != null && (
                          <span className="text-white font-mono"> · {formatGameTime(data.timeRemainingInPeriod)}</span>
                        )}
                      </span>
                    )}
                    {data.resultStatus === 'OFFICIAL' && effectiveSport !== 'CUR' && (
                      <span className="text-amber-200 font-semibold text-base">
                        <span className="text-white">Final</span>
                      </span>
                    )}
                    {data.resultStatus === 'OFFICIAL' && effectiveSport === 'CUR' && (
                      <span className="text-amber-200 font-semibold text-base">
                        <span className="text-white">Final</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* View full details link */}
              {data.homeTeam?.code && data.awayTeam?.code && (
                <div className="text-center">
                  <Link
                    to={effectiveSport === 'CUR'
                      ? `/curling-game/${data.homeTeam.code}-${data.awayTeam.code}${data.date ? `?date=${data.date}` : ''}`
                      : `/game/${data.homeTeam.code}-${data.awayTeam.code}${data.date ? `?date=${data.date}` : ''}`
                    }
                    className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
                    onClick={onClose}
                  >
                    View Full Details
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              )}

              {/* Team stats */}
              <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                <p className={`text-xs font-medium text-gray-400 uppercase tracking-wide ${isUpcoming ? 'mb-1' : 'mb-3'}`}>Team Stats</p>
                {isUpcoming && <p className="text-xs text-gray-500 mb-3">From rest of tournament</p>}
                <div className="grid grid-cols-2 gap-4">
                  {[data.homeTeam, data.awayTeam].filter(Boolean).map((team, i) => (
                    <div key={team.code || i} className="space-y-2">
                      <p className="text-sm font-medium text-white truncate">{formatTeamName(team.name, team.code)}</p>
                      <div className="space-y-1">
                        {effectiveSport === 'CUR' ? (
                          <>
                            {team.gameSuccessPercent != null && <StatRow label="Success%" value={`${team.gameSuccessPercent}%`} />}
                            <StatRow label="Draw" value={team.draw} />
                            <StatRow label="Takeout" value={team.takeout} />
                            <StatRow label="CW" value={team.cw} />
                            <StatRow label="CCW" value={team.ccw} />
                            {team.stolenEnds != null && parseInt(team.stolenEnds, 10) > 0 && <StatRow label="Stolen Ends" value={team.stolenEnds} />}
                            {team.stolenPoints != null && parseInt(team.stolenPoints, 10) > 0 && <StatRow label="Stolen Pts" value={team.stolenPoints} />}
                          </>
                        ) : (
                          <>
                            <StatRow label="SOG" value={team.sog} />
                            <StatRow label="GF" value={team.gf} />
                            {team.foPercent != null && <StatRow label="FO%" value={`${team.foPercent}%`} />}
                            {team.ppg != null && team.ppg > 0 && <StatRow label="PPG" value={team.ppg} />}
                            {team.pim != null && team.pim > 0 && <StatRow label="PIM" value={team.pim} />}
                            {team.svs != null && team.svs > 0 && <StatRow label="SVS" value={team.svs} />}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scoring summary (hockey only) */}
              {effectiveSport !== 'CUR' && (data.homeScorers?.length > 0 || data.awayScorers?.length > 0) && (
                <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                  <p className={`text-xs font-medium text-gray-400 uppercase tracking-wide ${isUpcoming ? 'mb-1' : 'mb-3'}`}>Scoring Summary</p>
                  {isUpcoming && <p className="text-xs text-gray-500 mb-3">From rest of tournament</p>}
                  <div className="grid grid-cols-2 gap-4">
                    <ScorersList scorers={data.homeScorers} teamName={formatTeamName(data.homeTeam?.name, data.homeTeam?.code)} />
                    <ScorersList scorers={data.awayScorers} teamName={formatTeamName(data.awayTeam?.name, data.awayTeam?.code)} />
                  </div>
                </div>
              )}

              {/* End scores (curling only — hockey period scores removed, redundant with play-by-play) */}
              {effectiveSport === 'CUR' && data.periods && data.periods.length > 0 && (
                <div className="rounded-lg bg-gray-700/60 px-4 py-3 border border-gray-600">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    End Scores
                  </p>
                  <div className="text-sm">
                    <div className="flex gap-4 mb-2 text-gray-400 font-medium">
                      <span className="w-8">End</span>
                      <span className="w-10 text-right">{data.homeTeam?.code ?? 'Home'}</span>
                      <span className="w-10 text-right">{data.awayTeam?.code ?? 'Away'}</span>
                      <span className="w-14 text-right">Earned</span>
                      <span className="w-8 text-center">H</span>
                      <span className="w-6 text-center">PP</span>
                    </div>
                    {data.periods.map((p, i) => (
                      <div key={i} className="flex gap-4 text-gray-300">
                        <span className="w-8 font-medium">E{p.code}</span>
                        <span className="w-10 text-right tabular-nums">{p.homeScore}</span>
                        <span className="w-10 text-right tabular-nums">{p.awayScore}</span>
                        <span className="w-14 text-right tabular-nums text-gray-400">{p.homeEarned != null && p.awayEarned != null ? `${p.homeEarned}–${p.awayEarned}` : '—'}</span>
                        <span className="w-8 text-center text-xs" title="Hammer">{p.hammer === 'home' ? (data.homeTeam?.code ?? 'H') : p.hammer === 'away' ? (data.awayTeam?.code ?? 'A') : '—'}</span>
                        <span className="w-6 text-center text-amber-400 text-xs font-medium" title={p.powerPlay === 'home' ? `${data.homeTeam?.code ?? 'Home'} power play` : p.powerPlay === 'away' ? `${data.awayTeam?.code ?? 'Away'} power play` : ''}>{p.powerPlay ? 'PP' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Play-by-Play (hockey only) */}
              {effectiveSport !== 'CUR' && data.playByPlay && data.playByPlay.length > 0 && (() => {
                const homeCode = data.homeTeam?.code;
                const awayCode = data.awayTeam?.code;
                const actionsByPeriod = {};
                for (const a of data.playByPlay) {
                  const p = a.period || '?';
                  if (!actionsByPeriod[p]) actionsByPeriod[p] = [];
                  actionsByPeriod[p].push(a);
                }
                const periodLabels = { P1: '1st Period', P2: '2nd Period', P3: '3rd Period', OT: 'Overtime', SO: 'Shootout' };
                const periodKeys = Object.keys(actionsByPeriod).sort((a, b) => {
                  const order = { P1: 1, P2: 2, P3: 3, OT: 4, SO: 5 };
                  return (order[a] || 99) - (order[b] || 99);
                });
                const actionIcons = {
                  GOAL: '🚨',
                  P: '⏱',
                  GK: '🥅',
                  STARTP: '▶',
                  ENDP: '⏸',
                };
                const actionLabels = {
                  GOAL: 'Goal',
                  P: 'Penalty',
                  GK: 'Goalie',
                  STARTP: 'Period Start',
                  ENDP: 'Period End',
                };
                return (
                  <div className="rounded-lg bg-gray-700 p-4 border border-gray-600">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Play-by-Play</p>
                    <div className="space-y-4">
                      {periodKeys.map(pk => (
                        <div key={pk}>
                          <p className="text-xs font-semibold text-amber-200 uppercase tracking-wide mb-2">
                            {periodLabels[pk] || pk}
                          </p>
                          <div className="space-y-1.5">
                            {actionsByPeriod[pk].map((a, i) => {
                              const isGoal = a.action === 'GOAL';
                              const isPenalty = a.action === 'P';
                              const isStructural = a.action === 'STARTP' || a.action === 'ENDP';
                              const isGK = a.action === 'GK';
                              const icon = actionIcons[a.action] || '•';
                              const label = actionLabels[a.action] || a.action;
                              const scorer = a.players?.find(p => p.role === 'SCR');
                              const assists = a.players?.filter(p => p.role === 'ASSIST1' || p.role === 'ASSIST2') || [];
                              const penaltyPlayer = isPenalty && a.players?.[0];
                              const gkPlayer = isGK && a.players?.[0];
                              const gkInOut = gkPlayer?.role === 'IN' ? 'In' : gkPlayer?.role === 'OUT' ? 'Out' : '';
                              const score = (a.scoreH != null && a.scoreA != null) ? `${a.scoreH}-${a.scoreA}` : '';
                              const teamColor = a.team === homeCode ? 'text-blue-300' : a.team === awayCode ? 'text-red-300' : 'text-gray-400';

                              if (isStructural) {
                                return (
                                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="w-12 text-right font-mono tabular-nums">{a.when}</span>
                                    <span>{icon}</span>
                                    <span>{label}</span>
                                  </div>
                                );
                              }

                              return (
                                <div key={i} className={`flex items-start gap-2 text-sm ${isGoal ? 'bg-gray-600/40 rounded px-2 py-1.5 -mx-2' : ''}`}>
                                  <span className="w-12 text-right font-mono tabular-nums text-gray-400 text-xs pt-0.5 shrink-0">{a.when}</span>
                                  <span className="shrink-0 pt-0.5">{icon}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {a.team && <span className={`font-semibold text-xs ${teamColor}`}>{a.team}</span>}
                                      {isGoal && scorer && (
                                        <span className="text-white font-medium">{scorer.name}{scorer.bib ? ` #${scorer.bib}` : ''}</span>
                                      )}
                                      {isGoal && score && (
                                        <span className="text-amber-200 font-semibold text-xs ml-auto shrink-0">{score}</span>
                                      )}
                                      {isPenalty && penaltyPlayer && (
                                        <span className="text-gray-200">{penaltyPlayer.name}{penaltyPlayer.bib ? ` #${penaltyPlayer.bib}` : ''}</span>
                                      )}
                                      {isGK && gkPlayer && (
                                        <span className="text-gray-300">{gkPlayer.name}{gkPlayer.bib ? ` #${gkPlayer.bib}` : ''} {gkInOut && <span className="text-gray-500">({gkInOut})</span>}</span>
                                      )}
                                      {!isGoal && !isPenalty && !isGK && (
                                        <span className="text-gray-300">{label}</span>
                                      )}
                                    </div>
                                    {isGoal && assists.length > 0 && (
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        Assists: {assists.map(a => `${a.name}${a.bib ? ` #${a.bib}` : ''}`).join(', ')}
                                      </p>
                                    )}
                                    {isGoal && a.result && (
                                      <span className="text-xs text-gray-500">{a.result === 'PP1' ? 'Power Play' : a.result === 'SH1' ? 'Shorthanded' : a.result === 'EQ' ? 'Even Strength' : a.result}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          );
          })()}
        </div>
      </aside>
    </>
  )
}
