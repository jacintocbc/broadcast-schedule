import { useState, useEffect } from 'react'
import moment from 'moment-timezone'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Milan 2026 Winter Olympics: Feb 6 = Day 0 (opening), Feb 22 = closing
const OLYMPICS_DAY_ZERO = moment.tz('2026-02-06', 'Europe/Rome').startOf('day')

// Country name overrides for display
const COUNTRY_SHORT_NAMES = {
  'United States of America': 'United States',
  "People's Republic of China": 'China',
  'Republic of Korea': 'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'Russian Olympic Committee': 'ROC',
}

// Flag filename overrides when folder uses different code than IOC (e.g. ROM -> ROU.jpg)
const FLAG_CODE_OVERRIDES = { ROM: 'ROU', FIJ: 'FJI', LBN: 'LIB', SGP: 'SIN' }
function getFlagSrc(countryCode) {
  const code = FLAG_CODE_OVERRIDES[countryCode] || countryCode
  return `/flags/${code}.jpg`
}

// Map WMO weather code to short condition label
function weatherCodeToLabel(code) {
  if (code === 0) return 'Clear'
  if (code <= 3) return code === 1 ? 'Mainly clear' : code === 2 ? 'Partly cloudy' : 'Overcast'
  if (code <= 49) return 'Fog'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Showers'
  if (code <= 94) return 'Thunderstorm'
  return 'Precipitation'
}

// Map event title to picto filename (public/picto). Order matters: more specific first.
// IHO = Ice hockey, ALP = Alpine skiing (event codes)
const PICTO_MAP = [
  ['iho', 'Ice-Hockey-Picto.png'],
  ['alp', 'Alpine-Skiing-Picto.png'],
  ['alpine', 'Alpine-Skiing-Picto.png'],
  ['biathlon', 'Biathlon-Picto.png'],
  ['bobsleigh', 'Bobsleigh-Picto.png'],
  ['cross-country', 'Cross-Country-Skiing-Picto.png'],
  ['curling', 'Curling-Picto.png'],
  ['figure skating', 'Figure-Skating-Picto.png'],
  ['freestyle', 'Freestyle-Skiing-Picto.png'],
  ['ice hockey', 'Ice-Hockey-Picto.png'],
  ['luge', 'Luge-Picto.png'],
  ['nordic combined', 'Nordic-Combined.png'],
  ['short track', 'Short-Track-Speed-Skating-Picto.png'],
  ['skeleton', 'Skeleton-Picto.png'],
  ['ski jumping', 'Ski-Jumping-Picto.png'],
  ['ski mountaineering', 'Ski-Mountaineering-Picto.png'],
  ['snowboard', 'Snowboard-Picto.png'],
  ['speed skating', 'Speed-Skating-Picto.png']
]
function getPictoPath(title) {
  if (!title || typeof title !== 'string') return '/picto/Curling-Picto.png'
  const lower = title.toLowerCase()
  for (const [key, file] of PICTO_MAP) {
    if (lower.includes(key)) return `/picto/${file}`
  }
  return '/picto/Curling-Picto.png'
}

// Sample events shown when API returns none (today in Milan: 10:00, 14:00, 18:30)
function getSampleEventsToday() {
  const today = moment.tz('Europe/Rome').format('YYYY-MM-DD')
  return [
    { id: 'sample-1', title: 'CUR01 SWE-KOR Mixed Doubles Round Robin - Curling', start_time: `${today}T09:00:00.000Z` },
    { id: 'sample-2', title: 'IHO01 W SWE-GER Preliminary Round - Ice Hockey', start_time: `${today}T13:00:00.000Z` },
    { id: 'sample-3', title: 'SBD01 M Snowboard Big Air Qual. - Snowboard', start_time: `${today}T17:30:00.000Z` }
  ]
}

export default function Dashboard() {
  const [olympicsDay, setOlympicsDay] = useState(null)
  const [todayLabel, setTodayLabel] = useState('')
  const [currentTime, setCurrentTime] = useState(() => moment.tz('Europe/Rome'))
  const [weather, setWeather] = useState({
    temp: null,
    condition: '',
    precipitation: null,
    daily: [],
    loading: true
  })
  const [eventsToday, setEventsToday] = useState([])
  const [sportsLoading, setSportsLoading] = useState(true)
  const [medalStandings, setMedalStandings] = useState([])
  const [medalMeta, setMedalMeta] = useState(null)

  // Live clocks (Milan + ET)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(moment.tz('Europe/Rome'))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Olympics day (Milan time)
  useEffect(() => {
    const now = moment.tz('Europe/Rome')
    const todayStart = now.clone().startOf('day')
    const dayDiff = todayStart.diff(OLYMPICS_DAY_ZERO, 'days')
    setOlympicsDay(dayDiff)
    setTodayLabel(now.format('dddd, MMMM D, YYYY'))
  }, [])

  // Weather: Open-Meteo (Milan coords) – current + precipitation + 5-day daily forecast
  useEffect(() => {
    let cancelled = false
    setWeather(prev => ({ ...prev, loading: true }))
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=45.4642&longitude=9.1900&current=temperature_2m,weather_code,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe/Rome&forecast_days=7'
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const cur = data?.current ?? {}
        const code = cur.weather_code ?? 0
        const condition = weatherCodeToLabel(code)
        const daily = data?.daily ?? {}
        const times = daily.time ?? []
        const dailyList = times.slice(0, 6).map((date, i) => ({
          date,
          code: (daily.weather_code ?? [])[i] ?? 0,
          max: (daily.temperature_2m_max ?? [])[i] ?? null,
          min: (daily.temperature_2m_min ?? [])[i] ?? null,
          precip: (daily.precipitation_sum ?? [])[i] ?? null
        }))
        setWeather({
          temp: cur.temperature_2m ?? null,
          condition,
          precipitation: cur.precipitation ?? null,
          daily: dailyList,
          loading: false
        })
      })
      .catch(() => {
        if (!cancelled) setWeather({ temp: null, condition: '—', precipitation: null, daily: [], loading: false })
      })
    return () => { cancelled = true }
  }, [])

  // Medal standings
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`${API_BASE}/api/medal-standings`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled || !d) return
          setMedalStandings(d.standings || [])
          setMedalMeta(d)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Events today: from OBS events for today (Milan date)
  useEffect(() => {
    let cancelled = false
    setSportsLoading(true)
    const today = moment.tz('Europe/Rome').format('YYYY-MM-DD')
    fetch(`${API_BASE}/api/events?date=${today}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : (data?.events ?? [])
        const withStart = list
          .filter(ev => (ev.title || ev.name || '').trim().length > 0 && ev.start_time)
          .map(ev => ({
            id: ev.id,
            title: (ev.title || ev.name || '').trim(),
            start_time: ev.start_time
          }))
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        setEventsToday(withStart)
      })
      .catch(() => setEventsToday([]))
      .finally(() => { if (!cancelled) setSportsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const dayDisplay = olympicsDay !== null
    ? olympicsDay < 0
      ? `Day ${olympicsDay}`
      : olympicsDay === 0
        ? 'Opening Day'
        : `Day ${olympicsDay}`
    : '—'

  const eventsToShow = eventsToday.length > 0 ? eventsToday : getSampleEventsToday()

  return (
    <div className="h-full flex flex-col min-h-0 p-4 gap-4 bg-gray-900 text-white">
      {/* Top row: Weather + Olympics Day — single row layout */}
      <div className="flex gap-4 flex-shrink-0">
        <section className="flex-1 rounded-xl bg-gray-800 border border-gray-600 p-4 flex flex-row items-center gap-6 min-h-0">
          <div className="flex flex-col justify-center flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-200 uppercase tracking-wide">Milan weather</h2>
            {weather.loading ? (
              <p className="text-2xl font-bold text-white mt-1">Loading…</p>
            ) : (
              <>
                <p className="text-3xl font-bold text-white mt-1">
                  {weather.temp != null ? `${Math.round(weather.temp)}°C` : '—'} {weather.condition && <span className="text-xl font-normal text-gray-100">{weather.condition}</span>}
                </p>
                {weather.precipitation != null && (
                  <p className="text-lg text-gray-300 mt-1">Precipitation now: <span className="font-semibold text-white">{weather.precipitation} mm</span></p>
                )}
              </>
            )}
          </div>
          {!weather.loading && weather.daily.length > 0 && (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide flex-shrink-0">5-day</h3>
              <div className="grid grid-cols-5 gap-2 flex-1">
                {weather.daily.slice(0, 5).map((day, i) => (
                  <div key={day.date} className="bg-gray-700 rounded-lg px-2 py-2 text-center border border-gray-600">
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {i === 0 ? 'Today' : moment(day.date).format('ddd')}
                    </div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {day.max != null ? `${Math.round(day.max)}°` : '—'} / {day.min != null ? `${Math.round(day.min)}°` : '—'}
                    </div>
                    <div className="text-sm text-gray-300 mt-0.5">{weatherCodeToLabel(day.code)}</div>
                    {day.precip != null && day.precip > 0 && (
                      <div className="text-sm text-gray-200 mt-0.5">{day.precip} mm</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="flex-1 rounded-xl border border-gray-600 p-4 flex flex-row items-center justify-between gap-6 min-h-0 flex-shrink-0 bg-gray-800">
          <div className="flex flex-col justify-center flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-200 uppercase tracking-wide">Olympics day</h2>
            <p className="text-3xl font-bold text-white mt-1">{dayDisplay}</p>
            <p className="text-base text-gray-300 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center flex-shrink-0">
            <div className="text-3xl font-bold text-white font-mono">
              {currentTime.clone().tz('Europe/Rome').format('HH:mm:ss')} CET
            </div>
            <span className="text-3xl font-bold text-white mx-4" style={{ transform: 'translateY(-2px)' }}>/</span>
            <div className="text-3xl font-bold text-white font-mono">
              {currentTime.clone().tz('America/New_York').format('HH:mm:ss')} <span className="font-bold">ET</span>
            </div>
          </div>
        </section>
      </div>

      {/* Main: Medals (larger) + Sports today (narrow column) */}
      <div className="flex-1 flex gap-4 min-h-0">
        <section className="flex-1 rounded-xl bg-gray-800 border border-gray-600 overflow-hidden flex flex-col min-w-0">
          <h2 className="text-base font-semibold text-gray-200 uppercase tracking-wide p-4 border-b border-gray-600 flex items-center justify-between">
            <span>Medal standings{medalMeta?.finishedEvents ? ` — ${medalMeta.finishedEvents}/${medalMeta.totalEvents} events` : ''}</span>
          </h2>
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-left">
              <thead className="bg-gray-700 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200">#</th>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200">Country</th>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200 text-center">G</th>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200 text-center">S</th>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200 text-center">B</th>
                  <th className="px-5 py-3 text-xl font-semibold text-gray-200 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {medalStandings.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400 text-lg">Loading medal standings…</td></tr>
                ) : medalStandings.map((row) => {
                  const displayName = COUNTRY_SHORT_NAMES[row.country] || row.country
                  const isCanadaInSlot10 = row.countryCode === 'CAN' && row.displayRank > 10
                  return (
                    <tr key={row.countryCode} className={`border-t border-gray-600 hover:bg-gray-700/50${isCanadaInSlot10 ? ' bg-gray-700/30' : ''}`}>
                      <td className="px-5 py-3 text-2xl font-medium text-gray-100">{row.displayRank}</td>
                      <td className="px-5 py-3 text-2xl font-medium text-white">
                        <span className="inline-flex items-center gap-2">
                          <img
                            src={getFlagSrc(row.countryCode)}
                            alt=""
                            className="h-6 w-10 flex-shrink-0 object-cover rounded-sm"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                          {displayName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-2xl text-center font-semibold text-amber-300">{row.gold}</td>
                      <td className="px-5 py-3 text-2xl text-center font-semibold text-gray-300">{row.silver}</td>
                      <td className="px-5 py-3 text-2xl text-center font-semibold text-amber-600">{row.bronze}</td>
                      <td className="px-5 py-3 text-2xl text-right font-semibold text-gray-100">{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="w-[36rem] flex-shrink-0 rounded-xl bg-gray-800 border border-gray-600 overflow-hidden flex flex-col min-h-0">
          <h2 className="text-base font-semibold text-gray-200 uppercase tracking-wide p-4 border-b border-gray-600">Sports today</h2>
          <div className="flex-1 overflow-auto p-4 min-h-0 space-y-3">
            {sportsLoading ? (
              <p className="text-gray-400 text-base">Loading…</p>
            ) : (
              eventsToShow.slice(0, 12).map(ev => (
                <div
                  key={ev.id || ev.start_time + ev.title}
                  className="flex items-center gap-4 rounded-lg bg-gray-700 text-white p-3 border border-gray-600"
                >
                  <img
                    src={getPictoPath(ev.title)}
                    alt=""
                    className="w-14 h-14 flex-shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-base truncate">{ev.title}</div>
                    <div className="text-gray-300 text-sm mt-0.5">
                      {moment.utc(ev.start_time).tz('Europe/Rome').format('HH:mm')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
