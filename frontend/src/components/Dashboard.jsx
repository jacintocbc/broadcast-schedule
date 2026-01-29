import { useState, useEffect } from 'react'
import moment from 'moment-timezone'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Milan 2026 Winter Olympics: Feb 6 = Day 0 (opening), Feb 22 = closing
const OLYMPICS_DAY_ZERO = moment.tz('2026-02-06', 'Europe/Rome').startOf('day')

// Mock top 10 medal standings (Winter Olympics style – replace with API later)
const MOCK_MEDALS = [
  { rank: 1, country: 'Norway', countryCode: 'NOR', gold: 16, silver: 8, bronze: 13, total: 37 },
  { rank: 2, country: 'Germany', countryCode: 'GER', gold: 12, silver: 10, bronze: 5, total: 27 },
  { rank: 3, country: 'Canada', countryCode: 'CAN', gold: 11, silver: 8, bronze: 10, total: 29 },
  { rank: 4, country: 'United States', countryCode: 'USA', gold: 9, silver: 9, bronze: 7, total: 25 },
  { rank: 5, country: 'Austria', countryCode: 'AUT', gold: 7, silver: 7, bronze: 5, total: 19 },
  { rank: 6, country: 'Sweden', countryCode: 'SWE', gold: 6, silver: 6, bronze: 3, total: 15 },
  { rank: 7, country: 'Netherlands', countryCode: 'NED', gold: 6, silver: 5, bronze: 2, total: 13 },
  { rank: 8, country: 'Switzerland', countryCode: 'SUI', gold: 5, silver: 6, bronze: 4, total: 15 },
  { rank: 9, country: 'France', countryCode: 'FRA', gold: 5, silver: 5, bronze: 3, total: 13 },
  { rank: 10, country: 'Italy', countryCode: 'ITA', gold: 4, silver: 6, bronze: 8, total: 18 }
]

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
const PICTO_MAP = [
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
    <div className="h-full flex flex-col min-h-0 p-4 gap-4 bg-slate-200">
      {/* Top row: Weather + Olympics Day — same height so bottom line aligns */}
      <div className="flex gap-4 flex-shrink-0 min-h-[220px]">
        <section className="flex-1 rounded-xl bg-slate-400 border border-slate-500 p-4 flex flex-col min-h-0">
          <div className="h-[100px] flex flex-col justify-start">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Milan weather</h2>
            {weather.loading ? (
              <p className="text-2xl font-bold text-white mt-1">Loading…</p>
            ) : (
              <>
                <p className="text-3xl font-bold text-white mt-1">
                  {weather.temp != null ? `${Math.round(weather.temp)}°C` : '—'} {weather.condition && <span className="text-lg font-normal text-slate-100">{weather.condition}</span>}
                </p>
                {weather.precipitation != null && (
                  <p className="text-base text-slate-200 mt-1">Precipitation now: <span className="font-semibold">{weather.precipitation} mm</span></p>
                )}
              </>
            )}
          </div>
          {!weather.loading && weather.daily.length > 0 && (
            <div className="border-t border-slate-500 pt-3 mt-1">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide mb-2">5-day forecast</h3>
              <div className="grid grid-cols-5 gap-2">
                {weather.daily.slice(0, 5).map((day, i) => (
                  <div key={day.date} className="bg-slate-500/80 rounded-lg px-2 py-2 text-center border border-slate-600">
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {i === 0 ? 'Today' : moment(day.date).format('ddd')}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {day.max != null ? `${Math.round(day.max)}°` : '—'} / {day.min != null ? `${Math.round(day.min)}°` : '—'}
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">{weatherCodeToLabel(day.code)}</div>
                    {day.precip != null && day.precip > 0 && (
                      <div className="text-xs text-slate-200 mt-0.5">{day.precip} mm</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="flex-1 rounded-xl border border-emerald-800/50 p-4 flex flex-col min-h-0" style={{ backgroundColor: '#0f5132' }}>
          <div className="h-[100px] flex flex-col justify-start flex-shrink-0">
            <h2 className="text-sm font-semibold text-emerald-100 uppercase tracking-wide">Olympics day</h2>
            <p className="text-3xl font-bold text-white mt-1">{dayDisplay}</p>
            <p className="text-sm text-emerald-100 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex-1 flex items-center justify-start gap-8 min-h-0 pt-4 border-t border-emerald-600/50">
            <div className="text-left">
              <div className="text-sm font-medium text-emerald-200 uppercase tracking-wide mb-1">Milan (CET)</div>
              <div className="text-4xl font-bold font-mono text-white tabular-nums">
                {currentTime.clone().tz('Europe/Rome').format('HH:mm:ss')}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-emerald-200 uppercase tracking-wide mb-1">ET</div>
              <div className="text-4xl font-bold font-mono text-white tabular-nums">
                {currentTime.clone().tz('America/New_York').format('HH:mm:ss')}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Main: Medals (larger) + Sports today (narrow column) */}
      <div className="flex-1 flex gap-4 min-h-0">
        <section className="flex-1 rounded-xl bg-white border border-slate-200 overflow-hidden flex flex-col min-w-0">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide p-4 border-b border-slate-100">Top 10 medal standings</h2>
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-left">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500">#</th>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500">Country</th>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500 text-center">G</th>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500 text-center">S</th>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500 text-center">B</th>
                  <th className="px-5 py-3 text-lg font-semibold text-slate-500 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_MEDALS.map(row => (
                  <tr key={row.countryCode} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 text-xl font-medium text-slate-700">{row.rank}</td>
                    <td className="px-5 py-3 text-xl font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        <img
                          src={getFlagSrc(row.countryCode)}
                          alt=""
                          className="h-5 w-8 flex-shrink-0 object-cover rounded-sm"
                          onError={e => { e.target.style.display = 'none' }}
                        />
                        {row.country}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xl text-center text-amber-600 font-semibold">{row.gold}</td>
                    <td className="px-5 py-3 text-xl text-center text-slate-400 font-semibold">{row.silver}</td>
                    <td className="px-5 py-3 text-xl text-center text-amber-700 font-semibold">{row.bronze}</td>
                    <td className="px-5 py-3 text-xl text-right font-semibold text-slate-700">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="w-[36rem] flex-shrink-0 rounded-xl bg-white border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide p-4 border-b border-slate-100">Sports today</h2>
          <div className="flex-1 overflow-auto p-4 min-h-0 space-y-3">
            {sportsLoading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : (
              eventsToShow.slice(0, 12).map(ev => (
                <div
                  key={ev.id || ev.start_time + ev.title}
                  className="flex items-center gap-4 rounded-lg bg-slate-700 text-white p-3"
                >
                  <img
                    src={getPictoPath(ev.title)}
                    alt=""
                    className="w-12 h-12 flex-shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{ev.title}</div>
                    <div className="text-slate-300 text-xs mt-0.5">
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
