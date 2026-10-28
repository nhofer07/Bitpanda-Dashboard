import { NAVIGATION_GROUPS, navigationGroup } from './navigationItems.js';

function Icon({ name }) {
  const paths = {
    home: 'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
    portfolio: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16M10 12v3h4v-3',
    chart: 'M4 20V4M4 20h17M8 15l4-5 4 2 5-7',
    trade: 'M4 7h15l-4-4M20 17H5l4 4'
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function Navigation({ activeView, setActiveView }) {
  const activeGroup = navigationGroup(activeView);
  return <>
    <div className="desktop-navigation">
      <nav className="main-nav grouped-nav" aria-label="Hauptbereiche">
        {NAVIGATION_GROUPS.map(group => <button key={group.id} className={activeGroup?.id === group.id ? 'active' : ''} aria-current={activeGroup?.id === group.id ? 'true' : undefined} onClick={() => setActiveView(group.items[0].id)}><Icon name={group.icon} /><span>{group.label}</span></button>)}
      </nav>
      {activeGroup?.items.length > 1 && <nav className="section-nav" aria-label={`Unterseiten ${activeGroup.label}`}>{activeGroup.items.map(item => <button key={item.id} className={item.id === activeView ? 'active' : ''} aria-current={item.id === activeView ? 'page' : undefined} onClick={() => setActiveView(item.id)}>{item.label}</button>)}</nav>}
    </div>
    {activeGroup?.items.length > 1 && <div className="mobile-view-picker"><label htmlFor="mobile-view">{activeGroup.label}<span>Ansicht wechseln</span></label><select id="mobile-view" value={activeView} onChange={event => setActiveView(event.target.value)}>{activeGroup.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
    <nav className="mobile-tab-bar" aria-label="Mobile Navigation">
      {NAVIGATION_GROUPS.map(group => <button key={group.id} className={activeGroup?.id === group.id ? 'active' : ''} aria-label={group.label} aria-current={activeGroup?.id === group.id ? 'true' : undefined} onClick={() => setActiveView(group.items[0].id)}><Icon name={group.icon} /><span>{group.short}</span></button>)}
    </nav>
  </>;
}
