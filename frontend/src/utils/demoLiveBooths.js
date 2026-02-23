// Post-Olympics demo: 6 booths always live (3 Toronto, 3 Montreal)
// Different sports, 1 PxP + 2 Color (Spare slot used for 2nd color in detail view)
export const DEMO_LIVE_BOOTHS = [
  // Toronto (VT)
  {
    id: 'demo-vt51',
    name: 'VT 51',
    city: 'toronto',
    eventTitle: 'IHO01 W CAN-USA Gold Medal Game - Ice Hockey',
    commentators: [
      { name: 'Chris Cuthbert', role: 'PxP' },
      { name: 'Cheryl Pounder', role: 'Color' },
      { name: 'Craig Simpson', role: 'Spare' }  // 2nd color analyst
    ]
  },
  {
    id: 'demo-vt52',
    name: 'VT 52',
    city: 'toronto',
    eventTitle: 'CUR01 SWE-NOR Mixed Doubles Gold - Curling',
    commentators: [
      { name: 'Vic Rauter', role: 'PxP' },
      { name: 'Linda Moore', role: 'Color' },
      { name: 'Russ Howard', role: 'Spare' }  // 2nd color
    ]
  },
  {
    id: 'demo-vt53',
    name: 'VT 53',
    city: 'toronto',
    eventTitle: 'SSK01 M 1500m Final - Speed Skating',
    commentators: [
      { name: 'Scott Russell', role: 'PxP' },
      { name: 'Catriona Le May Doan', role: 'Color' },
      { name: 'Kristina Groves', role: 'Spare' }  // 2nd color
    ]
  },
  // Montreal (VM)
  {
    id: 'demo-vm51',
    name: 'VM 51',
    city: 'montreal',
    eventTitle: 'ALP01 M Downhill - Alpine Skiing',
    commentators: [
      { name: 'Rod Black', role: 'PxP' },
      { name: 'Brian Stemmle', role: 'Color' },
      { name: 'Kelly VanderBeek', role: 'Spare' }  // 2nd color
    ]
  },
  {
    id: 'demo-vm52',
    name: 'VM 52',
    city: 'montreal',
    eventTitle: 'FSK01 Pairs Free Skate - Figure Skating',
    commentators: [
      { name: 'Brenda Irving', role: 'PxP' },
      { name: 'Tracy Wilson', role: 'Color' },
      { name: 'Meagan Duhamel', role: 'Spare' }  // 2nd color
    ]
  },
  {
    id: 'demo-vm53',
    name: 'VM 53',
    city: 'montreal',
    eventTitle: 'SBD01 M Snowboard Big Air Final - Snowboard',
    commentators: [
      { name: 'Rob Snoek', role: 'PxP' },
      { name: 'Craig McMorris', role: 'Color' },
      { name: 'Dominique Vallee', role: 'Spare' }  // 2nd color
    ]
  }
]

export function getDemoBoothById(id) {
  return DEMO_LIVE_BOOTHS.find(b => b.id === id)
}

export function getDemoBoothsByCity(city) {
  return DEMO_LIVE_BOOTHS.filter(b => b.city === city)
}
