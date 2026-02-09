/** Detect sport from block name: IHO (ice hockey) or CUR (curling). */
export function detectSport(block) {
  const name = (block?.name || block?.title || '').toLowerCase()
  if (/cur|curling/.test(name)) return 'CUR'
  if (/iho|ice hockey/.test(name)) return 'IHO'
  return null
}

/** Extract two IOC team codes from block/event name (e.g. GER-FRA, ITA-USA). */
export function extractTeamCodes(block) {
  const name = (block?.name || block?.title || '').toUpperCase()
  if (!name) return null
  const exclude = new Set(['IHO', 'CUR', 'OBS', 'CBC', 'TV', 'RC', 'GPB', 'GPA'])
  const matches = name.match(/\b([A-Z]{3})\b/g) || []
  const codes = [...new Set(matches)].filter(c => !exclude.has(c))
  if (codes.length >= 2) return { home: codes[0], away: codes[1] }
  return null
}
