export const at = hour => `2026-10-26T${String(hour).padStart(2, '0')}:00:00Z`;
export const asset = { assetKey: 'BTC', name: 'Bitcoin', displayName: 'Bitcoin', category: 'crypto', categoryLabel: 'Krypto', currentValue: 3000, currentPrice: 30000, currentQuantity: .1, costBasis: 2500, averageRemainingCost: 25000, averageEntrySource: 'Bitpanda Portfolio API', priceSource: 'Bitpanda Portfolio API', unrealizedProfit: 500, unrealizedProfitPercent: 20, trades: [] };
const transactions = [
  { id: 'deposit', attributes: { type: 'deposit', in_or_out: 'incoming', amount: '1000', status: 'finished', time: { date_iso8601: at(10) } } },
  { id: 'withdrawal', attributes: { type: 'withdrawal', in_or_out: 'outgoing', amount: '1000', status: 'finished', time: { date_iso8601: at(11) } } }
];
export const dashboard = {
  loadedAt: at(12), portfolio: { totalValue: 4150, investedValue: 3000, unrealizedProfit: 500, unrealizedProfitPercent: 20, liquidBalance: { totalValue: 1150, fiatValue: 1150, cashPlusValue: 0 }, openPositionCount: 1 },
  openPositions: [asset], profitLoss: { assets: [asset], top: {}, warnings: [] }, transactions,
  snapshots: [{ createdAt: at(9), totalValue: 4000 }, { createdAt: at(10), totalValue: 5100 }, { createdAt: at(11), totalValue: 4150 }, { createdAt: at(12), totalValue: 4150 }],
  portfolioHistoryStartedAt: at(9), paidTax: { available: true, salesPaid: 0, totalPaid: 0, dividendsPaid: 0, otherPaid: 0, yearly: [], events: [] }, cache: { status: 'fresh' }, accountInsights: { available: false }, dividends: []
};
export async function mockApp(page, overrides = {}) {
  await page.clock.install({ time: new Date(at(12)) });
  const state = { failDashboard: false, accepted: 0, accountReads: 0, quotes: 0, overrides: {}, dashboard: structuredClone(dashboard), ...overrides };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    let data = {}; let status = 200;
    if (!['GET', 'HEAD'].includes(route.request().method()) && !['/api/cashflow-overrides', '/api/trading/quotes'].includes(path)) { state.accepted++; throw new Error(`Unexpected mutation blocked: ${path}`); }
    if (path === '/api/auth/status') data = { required: false };
    else if (path === '/api/settings') data = { bitpandaConfigured: true, finnhubConfigured: true, fusionConfigured: true };
    else if (path === '/api/dashboard-data') { data = state.failDashboard ? { error: 'Test: Verbindung unterbrochen' } : state.dashboard; status = state.failDashboard ? 503 : 200; }
    else if (path === '/api/transactions') data = state.dashboard.transactions;
    else if (path === '/api/dashboard-summary') data = state.summary || { fiat: { monthly: [], yearly: [] }, profitLoss: { monthly: [], yearly: [] }, dividendDetails: [], paidTax: state.dashboard.paidTax };
    else if (path === '/api/cashflow-overrides') {
      if (route.request().method() === 'PUT') for (const [id, change] of Object.entries(route.request().postDataJSON().changes || {})) state.overrides[id] = change.value;
      data = { overrides: state.overrides, revision: 1 };
    }
    else if (path === '/api/market/history') data = { history: [{ date: at(9), close: 30000 }, { date: at(12), close: 30100 }], source: 'Testdaten', sourceCurrency: 'EUR', currency: 'EUR', interval: '1d' };
    else if (path === '/api/market/quotes') data = { items: JSON.parse(url.searchParams.get('items') || '[]').map(item => ({ symbol: item.symbol, price: state.dashboard.openPositions.find(p => p.assetKey === item.symbol)?.currentPrice || 30000, currency: 'EUR', changePercent: 1.24, source: 'Testdaten', updatedAt: at(12) })) };
    else if (path === '/api/public-account') {
      state.accountReads++;
      data = { resources: { assets: { ok: true, data: [{ id: 'btc', symbol: 'BTC', buy_active: true, sell_active: true }] }, currencies: { ok: true, data: [{ id: 'eur', symbol: 'EUR' }] }, portfolio: { ok: true, data: [{ asset_id: 'btc', balance: '.1', available_balance: '.05' }, { currency_id: 'eur', balance: '1150' }] } } };
    }
    else if (path === '/api/public-assets/search') data = { items: [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', price: 30000 }], total: 1 };
    else if (path === '/api/market/search') data = { items: [{ symbol: 'BTC', name: 'Bitcoin', category: 'crypto' }] };
    else if (path === '/api/trading/quotes') { state.quotes++; data = { quote_id: 'test-quote', quote: { price: 30000, quantity: .001, notional: 30, fee: 0, expires_at: new Date(Date.parse(at(12)) + 30_000).toISOString() } }; }
    else if (path.endsWith('/accept')) { state.accepted++; data = { trade_id: 'test-trade' }; }
    if (state.responses?.[path]) data = state.responses[path];
    if (state.failedPaths?.includes(path)) { status = 503; data = { error: 'Test: Datenquelle nicht erreichbar' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return state;
}


export function visualFixture() {
  const trade = { id: 'sale-1', type: 'sell', quantity: .02, fiat: 620, price: 31000, fee: 6.2, tradingFee: 6.2, realizedProfit: 79.3, grossRealizedProfit: 120, estimatedTax: 27.5, month: '2026-10', year: '2026', time: { date_iso8601: at(11) } };
  const stock = { ...asset, assetKey: 'MSFT', name: 'Microsoft', displayName: 'Microsoft', category: 'stock', categoryLabel: 'Aktie', currentQuantity: 20, averageRemainingCost: 350, currentPrice: 410, currentValue: 8200, costBasis: 7000, unrealizedProfit: 1200, unrealizedProfitPercent: 17.14, realizedProfit: 254.4, totalBoughtFiat: 8000, totalSoldFiat: 1254.4, grossRealizedProfit: 300, tradingFees: 12, financingFees: 0, estimatedTax: 33.6, buyCount: 5, sellCount: 2 };
  const etf = { ...stock, assetKey: 'SPYY', displayName: 'SPDR MSCI ACWI IMI UCITS ETF', name: 'SPDR MSCI ACWI IMI UCITS ETF', category: 'etf', categoryLabel: 'ETF', currentQuantity: 100, currentPrice: 98.23, averageRemainingCost: 90, currentValue: 9823, costBasis: 9000, unrealizedProfit: 823, unrealizedProfitPercent: 9.14, realizedProfit: 0, totalBoughtFiat: 9000, totalSoldFiat: 0, grossRealizedProfit: 0, tradingFees: 9, estimatedTax: 0, sellCount: 0 };
  const bitcoin = { ...asset, totalBoughtFiat: 3120, totalSoldFiat: 620, realizedProfit: 79.3, grossRealizedProfit: 120, estimatedTax: 27.5, tradingFees: 13.2, financingFees: 0, buyCount: 4, sellCount: 1, trades: [trade] };
  const data = structuredClone(dashboard);
  data.openPositions = [bitcoin, stock, etf];
  data.portfolio = { totalValue: 24563.78, investedValue: 21023, unrealizedProfit: 2523, unrealizedProfitPercent: 13.64, dividends: 42.5, openPositionCount: 3, liquidBalance: { totalValue: 3540.78, fiatValue: 1540.78, cashPlusValue: 2000 }, bestPosition: stock, worstPosition: etf };
  data.profitLoss = { assets: [bitcoin, stock, etf], top: {}, warnings: [] };
  data.transactions = [{ id: 'initial', attributes: { type: 'deposit', in_or_out: 'incoming', amount: '22000', status: 'finished', time: { date_iso8601: '2026-09-01T10:00:00Z' } } }, { ...transactions[0], attributes: { ...transactions[0].attributes, amount: '500', is_savings: true, payment_option_short_name: 'paypal' } }, { ...transactions[1], attributes: { ...transactions[1].attributes, amount: '100' } }];
  data.snapshots = Array.from({ length: 26 }, (_, i) => ({ createdAt: new Date(Date.parse(at(12)) - (25 - i) * 86400000).toISOString(), totalValue: 22500 + i * 60 + Math.sin(i / 2) * 250 }));
  data.snapshots.push(...[9, 10, 11, 12].map((hour, i) => ({ createdAt: at(hour), totalValue: [24000, 24560, 24480, 24563.78][i] })));
  data.portfolioHistoryStartedAt = data.snapshots[0].createdAt;
  data.paidTax = { available: true, salesPaid: 61.1, totalPaid: 65.2, dividendsPaid: 4.1, otherPaid: 0, events: [], yearly: [{ period: '2026', salesPaid: 61.1, totalPaid: 65.2, dividendsPaid: 4.1, otherPaid: 0, withheld: 65.2, refunded: 0, settlements: 0 }] };
  const ledger = [{ id: 'reward-1', date: at(8), year: '2026', name: 'Bitcoin', symbol: 'BTC', assetKey: 'BTC', label: 'Staking-Ertrag', transactionType: 'reward', delta: .0001, balanceAfter: .1, balanceCheck: 'matched', wallet: 'staking-service', feeAmount: 0 }];
  data.accountInsights = { available: true, coverage: { transactions: 128, firstDate: '2026-09-01T10:00:00Z', lastDate: at(12) }, ledger, rewards: [{ ...ledger[0], gross: .00012, fee: .00002, net: .0001, netEur: 3 }], rewardGroups: [{ year: '2026', symbol: 'BTC', assetKey: 'BTC', name: 'Bitcoin', label: 'Staking', count: 1, gross: .00012, fee: .00002, net: .0001, netEur: 3, unvalued: 0 }], costs: [], additionalCostsEur: 0, unvaluedCosts: 0, sourceTax: { totalPaid: 3, events: [] }, specialOperations: [], portfolioAvailable: true, portfolio: data.openPositions.map(p => ({ assetId: p.assetKey, assetKey: p.assetKey, name: p.displayName, symbol: p.assetKey, balance: p.currentQuantity, availableBalance: p.currentQuantity, currentValue: p.currentValue, investedAmount: p.costBasis, averageBuyPrice: p.averageRemainingCost, totalReturn: p.unrealizedProfit, totalReturnPercent: p.unrealizedProfitPercent })) };
  const period = { period: '2026-10', deposits: 500, withdrawals: 100, expenses: 0, transfers: 0, refunds: 0, net: 400, count: 2, realizedProfit: 333.7, grossRealizedProfit: 420, tradingFees: 25.2, estimatedTax: 61.1, dividends: 42.5, buyCount: 2, sellCount: 1, buys: 2000, sells: 1254.4 };
  const summary = { fiat: { monthly: [period], yearly: [{ ...period, period: '2026' }] }, profitLoss: { monthly: [period], yearly: [{ ...period, period: '2026' }], realizedTrades: [trade] }, dividendDetails: [], paidTax: data.paidTax };
  const responses = {
    '/api/market/analysis': { asset: { name: 'Bitcoin', symbol: 'BTC', price: 30000, currency: 'EUR', changePercent: 1.24, sourceUpdatedAt: at(12) }, analysis: { tendency: 'neutral', summary: 'Die verfügbaren Testdaten zeigen ein gemischtes Bild.', reasons: ['Seitwärtsbewegung im betrachteten Zeitraum'], outlook: { months: 'Weitere Kursentwicklung beobachten.', years: 'Langfristige Entwicklung bleibt offen.' }, opportunities: ['Breite Marktteilnahme'], risks: ['Hohe Kursschwankungen'], scenarios: [{ label: 'Neutral', tone: 'neutral', text: 'Eine Fortsetzung der Seitwärtsbewegung ist möglich.' }] }, analyst: { available: false, message: 'Für dieses Krypto-Asset liegt kein Analystenkonsens vor.' }, sources: ['Testdaten'], updatedAt: at(12) },
    '/api/fusion/overview': { account: { currentTier: { name: '1', fee: .0025 }, tradedVolume30d: 2500 }, balances: [{ symbol: 'EUR', available: 1500, locked: 50 }, { symbol: 'BTC', available: .05, locked: 0 }], pairs: [{ pair: 'BTC-EUR', baseAsset: 'BTC', quoteAsset: 'EUR', minOrderAmount: 1 }], tickers: [{ pair: 'BTC-EUR', price: 30000, high: 30450, low: 29640, volume: 542 }], orders: [], trades: [], updatedAt: at(12) },
    '/api/fusion/orderbook/BTC-EUR': { bids: [[29999, .1], [29998, .2], [29995, .5]], asks: [[30001, .1], [30002, .2], [30005, .3]] },
    '/api/fusion/candles/BTC-EUR': Array.from({ length: 24 }, (_, i) => ({ timestamp: Date.parse(at(12)) / 1000 - (23 - i) * 3600, close: 29750 + i * 10 + Math.sin(i) * 40 })),
    '/api/market/news': { items: [{ title: 'Marktüberblick: Unternehmen legen Quartalszahlen vor', source: 'Testquelle', publishedAt: at(10), url: 'https://example.invalid/news', impact: 'neutral', impactLabel: 'Neutral' }, { title: 'ETF-Sparpläne: Breite Indizes im Fokus', source: 'Testquelle', publishedAt: at(9), url: 'https://example.invalid/etf', impact: 'neutral', impactLabel: 'Neutral' }] }
  };
  return { dashboard: data, summary, responses };
}

// Account-scale edge cases, using synthetic history and no account credentials.
export function historyReviewFixture() {
  const fixture = visualFixture();
  const data = fixture.dashboard;
  data.profitLoss.assets = Array.from({ length: 64 }, (_, i) => ({ ...structuredClone(asset), assetKey: `TEST${i + 1}`, displayName: `Historisches Asset ${String(i + 1).padStart(2, '0')}`, realizedProfit: i - 32, grossRealizedProfit: i - 30, buyCount: 4, sellCount: 4, currentQuantity: 0, trades: [] }));
  data.profitLoss.warnings = [{ asset: 'TEST1' }];
  const cat = { ...structuredClone(asset), assetKey: 'CAT', displayName: 'Caterpillar', category: 'stock', categoryLabel: 'Aktien', reportedAssetId: 'cat-current', currentQuantity: .5, currentValue: 329.3, currentPrice: 658.6, costBasis: 318.32, unrealizedProfit: 10.98, unrealizedProfitPercent: 3.45 };
  const vision = { ...structuredClone(asset), assetKey: 'VSN', displayName: 'Vision', currentQuantity: .65, currentValue: .02, currentPrice: .04, costBasis: .02, unrealizedProfit: .01, unrealizedProfitPercent: 43.65 };
  data.openPositions = [cat, vision];
  data.profitLoss.assets[0].unmatchedSoldQuantity = .01;
  data.accountInsights.costs = [
    { id: 'known', transactionId: 'known', name: 'Ethereum', symbol: 'ETH', assetKey: 'ETH', label: 'Staking-Ertrag', category: 'earn', amount: .0001, eurAmount: .2, eurSource: 'Berechnet · historischer EUR-Buchungskurs', date: at(10), year: '2026' },
    { id: 'unknown', transactionId: 'unknown', name: 'Solana', symbol: 'SOL', assetKey: 'SOL', label: 'Staking-Ertrag', category: 'earn', amount: .0003, eurAmount: null, date: at(11), year: '2026' }
  ];
  data.accountInsights.additionalCostsEur = .2; data.accountInsights.unvaluedCosts = 1;
  fixture.responses['/api/public-account'] = { resources: {
    assets: { ok: true, data: [{ id: 'cat-legacy', symbol: 'CAT', buy_active: false, sell_active: false }, { id: 'cat-current', symbol: 'CAT', buy_active: true, sell_active: true }] },
    currencies: { ok: true, data: [{ id: 'eur', symbol: 'EUR' }] },
    portfolio: { ok: true, data: [{ asset_id: 'cat-current', balance: { value: '.5' }, available_balance: { value: '.5' } }, { currency_id: 'eur', available_balance: { value: '0' } }] }
  } };
  return fixture;
}
