// Block type definitions and utilities

export const BLOCK_TYPES = [
  'PRELIM',
  'FINAL/MEDAL',
  'NOT FOR BROADCAST',
  'CEREMONY',
  'OTHER',
  'TRAINING SESSION',
  'PRESS CONFERENCE',
  'BEAUTY CAMERA',
  'OBS HIGHLIGHT SHOW'
]

// Color mapping for block types (hex colors matching the legend)
export const BLOCK_TYPE_COLORS = {
  'PRELIM': '#fef08a', // light yellow
  'FINAL/MEDAL': '#fed7aa', // light orange
  'NOT FOR BROADCAST': '#dc2626', // red
  'CEREMONY': '#fbcfe8', // light pink
  'OTHER': '#ffffff', // white
  'TRAINING SESSION': '#e5e7eb', // light gray
  'PRESS CONFERENCE': '#9ca3af', // darker gray
  'BEAUTY CAMERA': '#fce7f3', // pale pink
  'OBS HIGHLIGHT SHOW': '#e9d5ff' // light purple
}

// Legacy types (removed from legend) → use NOT FOR BROADCAST color for backward compatibility
const LEGACY_TYPES_RED = new Set([
  'PRELIM NOT FOR STREAM',
  'FINAL/MEDAL NOT FOR STREAM',
  'R-C STREAM ONLY',
  'NEW'
])

// Default color if type is not set or invalid
export const DEFAULT_BLOCK_COLOR = '#10b981' // Default green (existing color)

/**
 * Infers the block type from an event name
 * @param {string} eventName - The name/title of the event
 * @returns {string} - The inferred block type, or 'OTHER' if no clear match
 */
export function inferBlockType(eventName) {
  if (!eventName) return 'OTHER'
  
  const name = eventName.toUpperCase()
  
  // Check for specific patterns in order of specificity
  
  // Beauty Camera - check if title starts with "BC" (case-insensitive)
  if (name.startsWith('BC')) {
    return 'BEAUTY CAMERA'
  }
  
  // Ceremony
  if (name.includes('CEREMONY') || name.includes('OPENING') || name.includes('CLOSING')) {
    return 'CEREMONY'
  }
  
  // Press Conference
  if (name.includes('PRESS CONFERENCE') || name.includes('PRESSER') || name.includes('MEDIA')) {
    return 'PRESS CONFERENCE'
  }
  
  // Training Session
  if (name.includes('TRAINING') || name.includes('PRACTICE')) {
    return 'TRAINING SESSION'
  }
  
  // Beauty Camera (other patterns)
  if (name.includes('BEAUTY') || name.includes('BEAUTY CAMERA')) {
    return 'BEAUTY CAMERA'
  }
  
  // OBS Highlight Show
  if (name.includes('HIGHLIGHT') || name.includes('HIGHLIGHTS')) {
    return 'OBS HIGHLIGHT SHOW'
  }
  
  // Not for broadcast / not for stream (check before Final/Medal and Prelim so we catch "not for stream" first when present)
  if (name.includes('NOT FOR BROADCAST') || name.includes('NOT FOR STREAM') || name.includes('NO STREAM')) {
    return 'NOT FOR BROADCAST'
  }
  
  // Final/Medal events
  if (name.includes('FINAL') || name.includes('MEDAL') || name.includes('GOLD') || 
      name.includes('SILVER') || name.includes('BRONZE') || name.includes('CHAMPIONSHIP')) {
    return 'FINAL/MEDAL'
  }
  
  // Preliminary events
  // Match "QUAL" as a word (with word boundaries or followed by punctuation/end of string)
  const qualPattern = /\bQUAL\b|QUAL\.|QUAL-|QUAL:/i
  if (name.includes('PRELIM') || name.includes('QUALIFYING') || name.includes('QUALIFICATION') ||
      qualPattern.test(name) ||
      name.includes('HEAT') || name.includes('ROUND') || name.includes('QUARTERFINAL') ||
      name.includes('SEMIFINAL')) {
    return 'PRELIM'
  }
  
  // R-C / Radio-Canada / stream-only → OTHER (type removed from legend)
  if (name.includes('R-C') || name.includes('RADIO-CANADA')) {
    return 'OTHER'
  }
  
  // Default to OTHER if no clear match
  return 'OTHER'
}

/**
 * Gets the background color (hex) for a block type
 * @param {string} type - The block type
 * @returns {string} - Hex color code for the background color
 */
export function getBlockTypeColor(type) {
  if (!type) return DEFAULT_BLOCK_COLOR
  if (LEGACY_TYPES_RED.has(type)) return BLOCK_TYPE_COLORS['NOT FOR BROADCAST']
  return BLOCK_TYPE_COLORS[type] || DEFAULT_BLOCK_COLOR
}

/**
 * Darkens a hex color by a specified amount
 * @param {string} hex - Hex color code (e.g., '#fef08a')
 * @param {number} percent - Percentage to darken (0-100, default 30)
 * @returns {string} - Darkened hex color code
 */
export function darkenColor(hex, percent = 30) {
  if (!hex) return '#000000'
  
  // Remove # if present
  hex = hex.replace('#', '')
  
  // Parse RGB
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  
  // Darken by reducing each component
  const factor = 1 - (percent / 100)
  const newR = Math.max(0, Math.floor(r * factor))
  const newG = Math.max(0, Math.floor(g * factor))
  const newB = Math.max(0, Math.floor(b * factor))
  
  // Convert back to hex
  const toHex = (n) => {
    const hex = n.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
}
