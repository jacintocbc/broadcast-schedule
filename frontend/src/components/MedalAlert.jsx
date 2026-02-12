import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const MEDAL_COLORS = {
  GOLD: { bg: 'from-yellow-600/90 to-yellow-800/90', border: 'border-yellow-400', text: 'text-yellow-200', icon: '🥇' },
  SILVER: { bg: 'from-gray-400/90 to-gray-600/90', border: 'border-gray-300', text: 'text-gray-100', icon: '🥈' },
  BRONZE: { bg: 'from-amber-700/90 to-amber-900/90', border: 'border-amber-500', text: 'text-amber-200', icon: '🥉' },
};

const DISMISS_KEY = 'olympus_dismissed_medals';

function getDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch { return {}; }
}

function setDismissed(dismissed) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
}

export default function MedalAlert() {
  const [medals, setMedals] = useState([]);
  const [dismissed, setDismissedState] = useState(getDismissed);
  const [visible, setVisible] = useState([]);

  const fetchMedals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/medals`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.medals && Array.isArray(data.medals)) {
        setMedals(data.medals);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchMedals();
    // Re-check every 2 minutes for new medals
    const interval = setInterval(fetchMedals, 120000);
    return () => clearInterval(interval);
  }, [fetchMedals]);

  // Filter out dismissed medals
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const current = getDismissed();
    // Clean old dismissals (not from today)
    const cleaned = {};
    for (const [k, v] of Object.entries(current)) {
      if (v === today) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length !== Object.keys(current).length) {
      setDismissed(cleaned);
      setDismissedState(cleaned);
    }
    const undismissed = medals.filter(m => {
      const id = m.id || `${m.sport}-${m.event_code || m.eventCode}-ME_${m.medal_type || m.medalType}-${m.event_date || m.eventDate}`;
      return !cleaned[id];
    });
    setVisible(undismissed);
  }, [medals]);

  const handleDismiss = (medal) => {
    const id = medal.id || `${medal.sport}-${medal.event_code || medal.eventCode}-ME_${medal.medal_type || medal.medalType}-${medal.event_date || medal.eventDate}`;
    const today = new Date().toISOString().slice(0, 10);
    const updated = { ...getDismissed(), [id]: today };
    setDismissed(updated);
    setDismissedState(updated);
    setVisible(prev => prev.filter(m => {
      const mid = m.id || `${m.sport}-${m.event_code || m.eventCode}-ME_${m.medal_type || m.medalType}-${m.event_date || m.eventDate}`;
      return mid !== id;
    }));
  };

  const handleDismissAll = () => {
    const today = new Date().toISOString().slice(0, 10);
    const updated = { ...getDismissed() };
    for (const m of visible) {
      const id = m.id || `${m.sport}-${m.event_code || m.eventCode}-ME_${m.medal_type || m.medalType}-${m.event_date || m.eventDate}`;
      updated[id] = today;
    }
    setDismissed(updated);
    setDismissedState(updated);
    setVisible([]);
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-1 right-3 z-[60] flex flex-col gap-1.5 max-w-md animate-slide-in">
      {visible.map((medal) => {
        const medalType = (medal.medal_type || medal.medalType || '').toUpperCase();
        const style = MEDAL_COLORS[medalType] || MEDAL_COLORS.BRONZE;
        const eventName = medal.event_name || medal.eventName || '';
        const disciplineName = medal.discipline_name || medal.disciplineName || '';
        const athletes = medal.athletes || [];
        const id = medal.id || `${medal.sport}-${medal.event_code || medal.eventCode}-ME_${medalType}-${medal.event_date || medal.eventDate}`;

        return (
          <div
            key={id}
            className={`bg-gradient-to-r ${style.bg} backdrop-blur-md border ${style.border} rounded-lg shadow-xl px-4 py-3 flex items-start gap-3 min-w-[340px]`}
          >
            <span className="text-2xl shrink-0 mt-0.5">{style.icon}</span>
            <div className="flex-1 min-w-0">
              <span className={`font-bold text-sm ${style.text} uppercase tracking-wide`}>{medalType}</span>
              <p className="text-white font-semibold text-sm mt-1 leading-tight">
                {disciplineName}{eventName ? ` — ${eventName}` : ''}
              </p>
              {athletes.length > 0 && athletes.length <= 3 && (
                <p className="text-white/80 text-[0.9375rem] mt-1">
                  {athletes.map(a => `${a.givenName} ${a.familyName}`).join(', ')}
                </p>
              )}
              {athletes.length > 3 && (
                <p className="text-white/80 text-[0.9375rem] mt-1">
                  Team Canada ({athletes.length} athletes)
                </p>
              )}
            </div>
            <button
              onClick={() => handleDismiss(medal)}
              className="text-white/60 hover:text-white transition-colors shrink-0 p-0.5"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
