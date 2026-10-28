import { Children, Fragment, isValidElement } from 'react';

function elements(children) {
  const result = [];
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) result.push(...elements(child.props.children));
    else result.push(child);
  });
  return result;
}
function text(children) {
  let result = '';
  Children.forEach(children, child => {
    if (typeof child === 'string' || typeof child === 'number') result += child;
    else if (isValidElement(child)) result += text(child.props.children);
  });
  return result.trim();
}
function cells(row, headers) {
  let column = 0;
  return elements(row.props.children).filter(cell => ['td', 'th'].includes(cell.type)).map(cell => {
    const index = column;
    const span = Math.max(1, Number(cell.props.colSpan) || 1);
    column += span;
    return { index, span, label: span === 1 ? headers[index]?.label || `Spalte ${index + 1}` : 'Weitere Angaben', content: cell.props.children, className: cell.props.className || '' };
  });
}
export function tableRecords(children) {
  const sections = elements(children);
  const head = sections.find(section => section.type === 'thead');
  const headerRow = head && elements(head.props.children).find(row => row.type === 'tr');
  const headers = headerRow ? elements(headerRow.props.children).map(cell => ({ label: text(cell.props.children) })) : [];
  const rows = sections.filter(section => section.type === 'tbody').flatMap(section => elements(section.props.children)).filter(row => row.type === 'tr');
  const foot = sections.filter(section => section.type === 'tfoot').flatMap(section => elements(section.props.children)).filter(row => row.type === 'tr');
  const identity = Math.max(0, headers.findIndex(header => /^Asset(?:$|\s|\s*\/)|^Kategorie$|^Jahr$/.test(header.label)));
  const priorities = [/^Gesamt$|^KESt gesamt$/, /^Netto|^Verkäufe · netto|^Gewinn|^Nach Gebühr$/, /^Rendite|^Aktueller Wert|^Steuerzahlung|^Quellensteuer$/, /^Bestand danach|^API-Eurobetrag|^Handelsgebühr$/];
  let value = -1;
  for (const pattern of priorities) {
    value = headers.findIndex((header, index) => index !== identity && pattern.test(header.label));
    if (value >= 0) break;
  }
  return {
    headers, identity, value,
    rows: rows.map((row, index) => ({ key: row.key ?? index, cells: cells(row, headers), onClick: row.props.onClick })),
    totals: foot.map((row, index) => ({ key: row.key ?? index, cells: cells(row, headers) }))
  };
}
