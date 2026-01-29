// Booths that can be assigned to multiple blocks at the same time (no availability check).
// Same logic as VIS and VOBS: sort group, always available, excluded from Live Booths view.
export const SHARED_BOOTH_NAMES = ['VIS', 'VOBS', 'VV MH2', 'VV MH1', 'VV MOS']

export const SHARED_BOOTH_SORT_ORDER = ['VIS', 'VOBS', 'VV MH1', 'VV MH2', 'VV MOS']

export function isSharedBooth(booth) {
  if (!booth || !booth.name) return false
  return SHARED_BOOTH_NAMES.includes(booth.name)
}
