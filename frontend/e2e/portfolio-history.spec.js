import { test, expect } from '@playwright/test';
import { at, mockApp } from './fixtures.js';
const frames = { '1d':'DAY', '1w':'WEEK', '1m':'MONTH', '6m':'SIX_MONTH', '1y':'YEAR' };
function history(range='1d', end=4150) {
  const snapshots=[{createdAt:'2026-10-25T13:00:00Z',totalValue:4000},{createdAt:at(10),totalValue:5100},{createdAt:at(11),totalValue:end},{createdAt:at(12),totalValue:end}];
  return {available:true,timeframe:frames[range],currency:'EUR',snapshots,reportedReturnPercent:3.75,firstPointAt:snapshots[0].createdAt,lastPointAt:snapshots.at(-1).createdAt,loadedAt:at(12),stale:false};
}
for (const width of [390,1440]) test(`official history and cashflow controls (${width}px)`, async ({ page }) => {
  await page.setViewportSize({width,height:1000});
  const state=await mockApp(page); state.dashboard.portfolio.totalValue=99999;
  await page.route('**/api/portfolio-history*',route=>route.fulfill({json:history()}));
  await page.goto('/'); const chart=page.locator('.portfolio-value-card');
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  await expect(chart.locator('.portfolio-chart-slider')).toHaveAttribute('max','3');
  await expect(chart.locator('.portfolio-chart-axis')).toContainText('25.10.26');
  await expect(chart.locator('.portfolio-chart-selection strong')).toHaveText('4.150,00 €');
  await expect(chart.locator('.portfolio-period-performance')).toContainText('+3,75 %');
  await expect(chart.locator('.portfolio-period-performance')).toContainText('Bereinigt +150,00 €');
  const adjusted=await chart.locator('polyline').getAttribute('points');
  await chart.getByRole('button',{name:'Tatsächliche Werte anzeigen'}).click();
  await expect(chart.locator('.portfolio-chart-y-labels')).toContainText('5.100,00');
  await expect(chart.locator('polyline')).not.toHaveAttribute('points',adjusted);
  const actual=await chart.locator('polyline').getAttribute('points');
  await chart.getByRole('button',{name:'Buchungen anzeigen'}).click();
  await expect(chart.locator('.portfolio-cashflow-dot')).toHaveCount(2);
  await chart.getByRole('button',{name:'Buchungen ausblenden'}).click();
  await expect(chart.locator('.portfolio-cashflow-dot')).toHaveCount(0);
  await expect(chart.locator('.portfolio-cashflow-list')).toHaveCount(1);
  await expect(chart.locator('polyline')).toHaveAttribute('points',actual);
  await chart.getByRole('button',{name:'Buchungen anzeigen'}).click();
  await chart.locator('.portfolio-cashflow-list summary').click();
  await chart.locator('.portfolio-cashflow-entry').first().click();
  await expect(chart.locator('.cashflow-selection')).toContainText('Einzahlung +1.000,00 €');
  await chart.getByRole('button',{name:'Tatsächliche Werte anzeigen'}).click();
  await expect(chart.locator('polyline')).toHaveAttribute('points',adjusted);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a slow older response cannot replace a newer period', async ({page})=>{
  await mockApp(page); const pending=[];
  await page.route('**/api/portfolio-history*',route=>{
    const range=new URL(route.request().url()).searchParams.get('range');
    if(range==='1w') { pending.push(route);return; }
    return route.fulfill({json:history(range,range==='1m'?4321:4150)});
  });
  await page.goto('/');const chart=page.locator('.portfolio-value-card');
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  await chart.getByRole('button',{name:'1 Woche',exact:true}).click();
  await expect.poll(()=>pending.length).toBe(1);
  await chart.getByRole('button',{name:'1 Monat',exact:true}).click();
  await expect(chart.locator('.portfolio-chart-selection strong')).toHaveText('4.321,00 €');
  await pending[0].fulfill({json:history('1w',1234)}).catch(()=>{});
  await expect(chart.locator('.portfolio-chart-selection strong')).toHaveText('4.321,00 €');
});
test('API failure uses an honest local fallback and saved history remains accessible', async({page})=>{
  await mockApp(page);
  await page.route('**/api/portfolio-history*',route=>route.fulfill({status:503,json:{error:'offline'}}));
  await page.goto('/');const chart=page.locator('.portfolio-value-card');
  await expect(chart.locator('.portfolio-history-status')).toContainText('gespeicherte Kontostände');
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Gespeicherter Verlauf');
  await chart.getByRole('button',{name:'Buchungen anzeigen'}).click();
  await expect(chart.locator('.portfolio-cashflow-dot')).toHaveCount(2);
  await chart.getByRole('button',{name:'Gespeichert',exact:true}).click();
  await expect(chart.locator('.portfolio-history-status')).toHaveCount(0);
  await expect(chart.locator('polyline')).toBeVisible();
});
test('background failure retains official data, marks it stale and permits a real retry', async({page})=>{
  await mockApp(page);let fail=false;const urls=[];
  await page.route('**/api/portfolio-history*',route=>{urls.push(route.request().url());return route.fulfill(fail?{status:503,json:{error:'offline'}}:{json:history()});});
  await page.goto('/');const chart=page.locator('.portfolio-value-card');
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  const line=await chart.locator('polyline').getAttribute('points');fail=true;
  await page.clock.fastForward(61_000);
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda · letzter Abruf');
  await expect(chart.locator('polyline')).toHaveAttribute('points',line);
  fail=false;await chart.getByRole('button',{name:'Erneut versuchen'}).click();
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  expect(urls.at(-1)).toContain('refresh=1');
});

test('month comparison and confirmed correction preserve the original', async ({page}) => {
  const state = await mockApp(page);
  const start=Date.parse(at(0)), hour=3600000;
  state.dashboard.portfolioHistoryStartedAt=at(0);
  state.dashboard.transactions=[];
  state.dashboard.snapshots=[{createdAt:new Date(start+12*hour-60000).toISOString(),totalValue:3315},{createdAt:new Date(start+12*hour+60000).toISOString(),totalValue:3316}];
  state.dashboard.loadedAt=new Date(start+24*hour).toISOString();
  state.dashboard.portfolio.totalValue=3304;
  await page.route('**/api/portfolio-history*',route=>{
    const range=new URL(route.request().url()).searchParams.get('range');
    const snapshots=range==='6m'?[3304,3304,3304].map((totalValue,i)=>({createdAt:new Date(start+i*24*hour).toISOString(),totalValue})):[3309,3521,3319,3304,3304].map((totalValue,i)=>({createdAt:new Date(start+i*6*hour).toISOString(),totalValue}));
    return route.fulfill({json:{...history(range),snapshots,loadedAt:new Date(start+48*hour).toISOString(),firstPointAt:snapshots[0].createdAt,lastPointAt:snapshots.at(-1).createdAt}});
  });
  await page.goto('/');const chart=page.locator('.portfolio-value-card');
  await chart.getByRole('button',{name:'1 Monat',exact:true}).click();
  await expect(chart.locator('.portfolio-history-corrections summary')).toContainText('1 Bitpanda-Messpunkt');
  await chart.locator('.portfolio-history-corrections summary').click();
  await expect(chart.locator('.portfolio-history-corrections')).toContainText('3.521,00 €');
  await expect(chart.locator('.portfolio-history-corrections')).toContainText('3.315,00 €');
  await expect(chart.locator('.portfolio-chart-y-labels')).not.toContainText('3.521');
  await expect(chart.locator('.portfolio-period-performance')).not.toContainText('Rendite · Bitpanda');
  await expect(chart.locator('.portfolio-history-comparison summary')).toContainText('0 Abweichungen');
});

for (const width of [390, 1440]) test(`period switches never flash saved snapshots (${width}px)`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  const state=await mockApp(page);
  state.dashboard.portfolioHistoryStartedAt='2020-01-01T00:00:00Z';
  state.dashboard.snapshots=[{createdAt:'2020-01-01T00:00:00Z',totalValue:4000},...Array.from({length:720},(_,i)=>({createdAt:new Date(Date.parse(at(0))+i*60000).toISOString(),totalValue:4000+i%7}))];
  const pending=new Map();
  await page.route('**/api/portfolio-history*',route=>{
    const range=new URL(route.request().url()).searchParams.get('range');
    pending.set(range,[...(pending.get(range)||[]),route]);
  });
  await page.goto('/');const chart=page.locator('.portfolio-value-card');
  await expect(chart).toBeVisible();
  await page.evaluate(()=>{
    window.chartFrames=[];
    const record=()=>{
      const c=document.querySelector('.portfolio-value-card');
      window.chartFrames.push({range:c?.querySelector('.portfolio-range-buttons .active')?.textContent,count:c?.querySelector('polyline')?.getAttribute('points')?.trim().split(/\s+/).length||0,local:c?.querySelector('.chart-context .data-quality')?.textContent==='Gespeicherter Verlauf'});
    };
    window.chartObserver=new MutationObserver(record);
    window.chartObserver.observe(document.querySelector('.portfolio-value-card'),{subtree:true,childList:true,attributes:true,characterData:true});record();
  });
  for(const [range,label] of [['1d','1 Tag'],['1w','1 Woche'],['1m','1 Monat'],['6m','6 Monate'],['1y','1 Jahr']]) {
    if(range!=='1d') await chart.getByRole('button',{name:label,exact:true}).click();
    await expect.poll(()=>pending.get(range)?.length||0).toBeGreaterThan(0);
    await expect(chart.locator('.portfolio-chart-pending')).toBeVisible();
    await expect(chart.locator('polyline')).toHaveCount(0);
    if(range==='1m') await page.screenshot({path:`../artifacts/ui-review/chart-period-loading-${width}.png`,fullPage:true});
    const requests=pending.get(range);pending.set(range,[]);
    for(const request of requests) await request.fulfill({json:history(range)}).catch(()=>{});
    await expect(chart.locator('polyline')).toBeVisible();
    await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  }
  await chart.getByRole('button',{name:'1 Monat',exact:true}).click();
  await expect(chart.locator('polyline')).toBeVisible();
  await expect(chart.locator('.portfolio-chart-pending')).toHaveCount(0);
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  await page.screenshot({path:`../artifacts/ui-review/chart-period-cached-${width}.png`,fullPage:true});
  const frames=await page.evaluate(()=>{window.chartObserver.disconnect();return window.chartFrames;});
  expect(frames.length).toBeGreaterThan(5);
  expect(frames.filter(frame=>frame.local||frame.count>4)).toEqual([]);
  await chart.getByRole('button',{name:'Gespeichert',exact:true}).click();
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Gespeicherter Verlauf');
  await expect(chart.locator('polyline')).toBeVisible();
  await chart.getByRole('button',{name:'5 Jahre',exact:true}).click();
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Gespeicherter Verlauf');
  await chart.getByRole('button',{name:'1 Tag',exact:true}).click();
  await expect(chart.locator('.chart-context .data-quality')).toHaveText('Bitpanda');
  await expect(chart.locator('.portfolio-chart-pending')).toHaveCount(0);
});

test('yearly isolated spikes stay out of extrema and leave gaps until independently confirmed', async ({ page }) => {
  await mockApp(page); let confirmed = false;
  const snapshots = [3400, 3390, 4700, 3410, 3420].map((totalValue, i) => ({ createdAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 2 * 86400000).toISOString(), totalValue }));
  await page.route('**/api/portfolio-history*', route => { const range = new URL(route.request().url()).searchParams.get('range'); return route.fulfill({ json: range === '1y' ? { ...history('1y'), snapshots, firstPointAt: snapshots[0].createdAt, lastPointAt: snapshots.at(-1).createdAt } : history(range) }); });
  await page.route('**/api/portfolio-history-audit*', route => route.fulfill({ json: confirmed ? { pending: false, checks: [{ time: Date.parse(snapshots[2].createdAt), status: 'confirmed', reconstructedValue: 4700 }] } : { pending: true, checks: [] } }));
  await page.goto('/'); const chart = page.locator('.portfolio-value-card');
  await chart.getByRole('button', { name: 'Tatsächliche Werte anzeigen' }).click();
  await chart.getByRole('button', { name: '1 Jahr', exact: true }).click();
  await expect(chart.locator('.portfolio-history-audit')).toContainText('bis zur Bestätigung ausgeblendet');
  await expect(chart.locator('.portfolio-chart-y-labels')).not.toContainText('4.700');
  await expect(chart.locator('polyline')).toHaveCount(2);
  const top = await chart.locator('.portfolio-history-audit').boundingBox(), plot = await chart.locator('.portfolio-chart-wrap').boundingBox(); expect(top.y).toBeGreaterThan(plot.y);
  confirmed = true; await page.clock.fastForward(4100);
  await expect(chart.locator('.portfolio-history-audit')).toHaveCount(0); await expect(chart.locator('.portfolio-chart-y-labels')).toContainText('4.700');
});
