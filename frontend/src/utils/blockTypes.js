// Block type definitions and utilities

export const BLOCK_TYPES = [
  'PRELIM',
  'PRELIM NOT FOR STREAM',
  'FINAL/MEDAL',
  'FINAL/MEDAL NOT FOR STREAM',
  'NEW',
  'CEREMONY',
  'OTHER',
  'TRAINING SESSION',
  'PRESS CONFERENCE',
  'BEAUTY CAMERA',
  'OBS HIGHLIGHT SHOW',
  'R-C STREAM ONLY'
]

// Color mapping for block types (hex colors matching the legend)
export const BLOCK_TYPE_COLORS = {
  'PRELIM': '#fef08a', // light yellow
  'PRELIM NOT FOR STREAM': '#bfdbfe', // light blue
  'FINAL/MEDAL': '#fed7aa', // light orange
  'FINAL/MEDAL NOT FOR STREAM': '#bbf7d0', // light green
  'NEW': '#ef4444', // bright red
  'CEREMONY': '#fbcfe8', // light pink
  'OTHER': '#ffffff', // white
  'TRAINING SESSION': '#e5e7eb', // light gray
  'PRESS CONFERENCE': '#9ca3af', // darker gray
  'BEAUTY CAMERA': '#fce7f3', // pale pink
  'OBS HIGHLIGHT SHOW': '#e9d5ff', // light purple
  'R-C STREAM ONLY': '#fde047' // golden yellow
}

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
  
  // Beauty Camera
  if (name.includes('BEAUTY') || name.includes('BEAUTY CAMERA')) {
    return 'BEAUTY CAMERA'
  }
  
  // OBS Highlight Show
  if (name.includes('HIGHLIGHT') || name.includes('HIGHLIGHTS')) {
    return 'OBS HIGHLIGHT SHOW'
  }
  
  // R-C Stream Only
  if (name.includes('R-C') || name.includes('RADIO-CANADA') || name.includes('STREAM ONLY')) {
    return 'R-C STREAM ONLY'
  }
  
  // Final/Medal events
  if (name.includes('FINAL') || name.includes('MEDAL') || name.includes('GOLD') || 
      name.includes('SILVER') || name.includes('BRONZE') || name.includes('CHAMPIONSHIP')) {
    // Check if it's "not for stream"
    if (name.includes('NOT FOR STREAM') || name.includes('NO STREAM')) {
      return 'FINAL/MEDAL NOT FOR STREAM'
    }
    return 'FINAL/MEDAL'
  }
  
  // Preliminary events
  // Match "QUAL" as a word (with word boundaries or followed by punctuation/end of string)
  const qualPattern = /\bQUAL\b|QUAL\.|QUAL-|QUAL:/i
  if (name.includes('PRELIM') || name.includes('QUALIFYING') || name.includes('QUALIFICATION') ||
      qualPattern.test(name) ||
      name.includes('HEAT') || name.includes('ROUND') || name.includes('QUARTERFINAL') ||
      name.includes('SEMIFINAL')) {
    // Check if it's "not for stream"
    if (name.includes('NOT FOR STREAM') || name.includes('NO STREAM')) {
      return 'PRELIM NOT FOR STREAM'
    }
    return 'PRELIM'
  }
  
  // New events (recently added or updated)
  if (name.includes('NEW') || name.includes('UPDATED') || name.includes('LATEST')) {
    return 'NEW'
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
