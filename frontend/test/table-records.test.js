import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { tableRecords } from '../src/components/tableRecords.js';

test('record labels and totals preserve column alignment after colspan and fragments', () => {
  const action = () => {};
  const model = tableRecords([
    h('thead', null, h('tr', null, ...['Datum', 'Asset', 'Gebühr', 'Gesamt', 'Quelle'].map(label => h('th', { key: label }, label)))),
    h('tbody', null, h(Fragment, null, h('tr', { key: 'sale', onClick: action }, h('td', null, '26.10.2026'), h('td', null, h('button', { onClick: action }, 'Bitcoin')), h('td', null, '2,00 €'), h('td', null, '3,00 €'), h('td', null, 'Beleg-123')))),
    h('tfoot', null, h('tr', null, h('td', { colSpan: 3 }, 'Summe'), h('td', null, '3,00 €'), h('td', null)))
  ]);
  assert.equal(model.identity, 1);
  assert.equal(model.value, 3);
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].cells[4].label, 'Quelle');
  assert.equal(model.rows[0].cells[4].content, 'Beleg-123');
  assert.equal(model.rows[0].cells[1].content.props.onClick, action);
  assert.equal(model.rows[0].onClick, action);
  assert.equal(model.totals[0].cells[1].label, 'Gesamt');
  assert.equal(model.totals[0].cells[1].content, '3,00 €');
});
test('zero values and every detail field remain available without a preferred summary amount', () => {
  const model = tableRecords([
    h('thead', null, h('tr', null, h('th', null, 'Jahr'), h('th', null, 'Buchungen'), h('th', null, 'Hinweise'))),
    h('tbody', null, h('tr', null, h('td', null, 2026), h('td', null, 0), h('td', null, 'Keine Buchungen')))
  ]);
  assert.equal(model.value, -1);
  assert.deepEqual(model.rows[0].cells.map(cell => cell.content), [2026, 0, 'Keine Buchungen']);
});
