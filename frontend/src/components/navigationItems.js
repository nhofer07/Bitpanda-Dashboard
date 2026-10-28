export const NAVIGATION_GROUPS = [
  { id: 'cockpit', label: 'Cockpit', short: 'Cockpit', icon: 'home', items: [
    { id: 'home', label: 'Cockpit' }
  ] },
  { id: 'portfolio', label: 'Portfolio', short: 'Portfolio', icon: 'portfolio', items: [
    { id: 'assets', label: 'Assets' }, { id: 'fiat', label: 'Cashflow' }, { id: 'account', label: 'Kontodaten' }
  ] },
  { id: 'analysis', label: 'Auswertungen', short: 'Auswertung', icon: 'chart', items: [
    { id: 'profits', label: 'Gewinne & Verluste' }, { id: 'overview', label: 'Zeiträume' }, { id: 'calendar', label: 'Kalender' },
    { id: 'fees', label: 'Gebühren' }, { id: 'tax', label: 'Steuern' }, { id: 'calculator', label: 'Zielrechner' }
  ] },
  { id: 'trade', label: 'Markt & Handel', short: 'Markt', icon: 'trade', items: [
    { id: 'market', label: 'Marktanalyse' }, { id: 'fusion', label: 'Fusion' }
  ] }
];
export function navigationGroup(view) { return NAVIGATION_GROUPS.find(group => group.items.some(item => item.id === view)); }
export function viewTitle(view) { return NAVIGATION_GROUPS.flatMap(group => group.items).find(item => item.id === view)?.label || 'Einstellungen'; }
export const VIEW_IDS = new Set([...NAVIGATION_GROUPS.flatMap(group => group.items.map(item => item.id)), 'settings']);
