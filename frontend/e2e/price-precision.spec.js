import { test, expect } from '@playwright/test';
import { mockApp, asset, at } from './fixtures.js';

for(const width of [390,1440]) for(const [symbol,value,formatted] of [['XRP',1.17234,'1,1723'],['VISION',.02317,'0,0232']]) test(`${symbol} unit price and chart retain four decimals (${width}px)`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const state=await mockApp(page);
 const position={...asset,assetKey:symbol,name:symbol,displayName:symbol,currentPrice:value,currentQuantity:100,currentValue:value*100,averageRemainingCost:value};
 state.dashboard.openPositions=[position];state.dashboard.profitLoss.assets=[position];
 await page.route('**/api/market/history*',route=>route.fulfill({json:{history:[{date:at(9),close:value-.0002},{date:at(12),close:value}],source:'Bitpanda',sourceCurrency:'EUR',currency:'EUR',interval:'5m'}}));
 await page.goto('/#assets');
 await expect(page.locator('.asset-market-summary h3')).toHaveText(`${formatted} €`);
 const chart=page.locator('.market-history');
 await expect(chart.locator('.history-summary strong')).toContainText(`${formatted} EUR`);
 await expect(chart.locator('.history-slider input')).toHaveAttribute('aria-valuetext',new RegExp(formatted));
 const labels=await chart.locator('.history-svg text').allTextContents();
 expect(labels.filter(text=>/^\d+,\d{4}$/.test(text)).length).toBe(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await chart.screenshot({path:`../artifacts/ui-review/price-${symbol}-${width}.png`});
});

test('even a high-priced asset gets distinct chart labels when price movements are small',async({page})=>{
 const state=await mockApp(page);
 state.dashboard.openPositions=[{...asset,currentPrice:71924.9732}];
 await page.route('**/api/market/history*',route=>route.fulfill({json:{history:[{date:at(9),close:71924.9730},{date:at(12),close:71924.9732}],source:'Bitpanda',sourceCurrency:'EUR',currency:'EUR',interval:'5m'}}));
 await page.goto('/#assets');
 const chart=page.locator('.market-history');
 await expect(chart.locator('.history-summary strong')).toContainText('71.924,9732 EUR');
 const labels=await chart.locator('.history-svg text').allTextContents();
 const ticks=labels.filter(text=>text.startsWith('71.924,'));
 expect(new Set(ticks).size).toBe(3);
});
