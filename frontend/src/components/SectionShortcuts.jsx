// Section navigation deliberately leaves the application's route hash intact.
export default function SectionShortcuts({ label, items }) {
  function jump(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  return <nav className="section-shortcuts" aria-label={label}>{items.map(item => <button type="button" key={item.id} onClick={() => jump(item.id)}>{item.label}<span aria-hidden="true">↓</span></button>)}</nav>;
}
