import { test, expect } from '@playwright/test';
import { mockApp, visualFixture } from './fixtures.js';
const drawing = { id: 'legacy-line', type: 'line', color: '#29bd94', text: '', points: [{ time: 1770000000, price: 30000 }, { time: 1770003600, price: 31000 }] };
for (const width of [390,1440]) test(`legacy drawings remain available with directly visible deletion (${width}px)`, async ({ page }) => {
 await page.setViewportSize({width,height:1000});const state=await mockApp(page);Object.assign(state,visualFixture());let stored={revision:1,drawings:[drawing]};
 await page.route('https://www.tradingview-widget.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body>TradingView</body></html>'}));
 await page.route('**/api/chart-drawings/**',async r=>{if(r.request().method()==='PUT'){const next=r.request().postDataJSON();expect(next.revision).toBe(stored.revision);stored={revision:stored.revision+1,drawings:next.drawings};}await r.fulfill({json:stored});});
 await page.goto('/#fusion');await expect(page.getByRole('button',{name:'Zeichnungen · gespeichert',exact:true})).toHaveCount(0);
 await page.locator('.legacy-drawing-management summary').click();const manager=page.locator('.saved-drawing-manager');
 await expect(manager.getByRole('button',{name:'Löschen',exact:true})).toBeVisible();await expect(manager).toContainText('Trendlinie 1');
 await page.reload();await page.locator('.legacy-drawing-management summary').click();await expect(manager).toContainText('Trendlinie 1');
 await manager.getByRole('button',{name:'Löschen',exact:true}).click();await expect(manager).toContainText('Keine Markierungen');expect(stored.drawings).toHaveLength(0);
});
test('failed deletion preserves the server record and a recoverable local draft',async({page})=>{
 const state=await mockApp(page);Object.assign(state,visualFixture());let offline=true,stored={revision:1,drawings:[drawing]};
 await page.route('https://www.tradingview-widget.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body>TradingView</body></html>'}));
 await page.route('**/api/chart-drawings/**',async r=>{if(r.request().method()==='PUT'){if(offline)return r.fulfill({status:503,json:{error:'Speichern derzeit nicht möglich.'}});const next=r.request().postDataJSON();stored={revision:2,drawings:next.drawings};}await r.fulfill({json:stored});});
 await page.goto('/#fusion');await page.locator('.legacy-drawing-management summary').click();const manager=page.locator('.saved-drawing-manager');await manager.getByRole('button',{name:'Löschen',exact:true}).click();await expect(manager.getByRole('alert')).toContainText('Speichern derzeit nicht möglich');expect(stored.drawings).toHaveLength(1);
 await page.reload();await page.locator('.legacy-drawing-management summary').click();await expect(manager.getByRole('alert')).toContainText('Entwurf wurde wiederhergestellt');offline=false;await manager.getByRole('button',{name:'Erneut speichern',exact:true}).click();await expect(manager.getByRole('alert')).toHaveCount(0);expect(stored.drawings).toHaveLength(0);
});
