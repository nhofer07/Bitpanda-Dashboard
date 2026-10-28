import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountInsights } from '../account-insights.js';
const options = { eurCurrencyId: 'eur', assets: [{ id: 'eth', symbol: 'ETH', name: 'Ethereum' }], currencies: [{ id: 'eur', symbol: 'EUR' }] };
const tx = (id, amount, extra = {}) => ({ transaction_id: id, wallet_id: 'cash', wallet_owner: 'shared-default', currency_id: 'eur', asset_amount: { value: String(amount), currency_id: 'eur' }, fee_amount: { value: '0', currency_id: 'eur' }, flow: 'OUTGOING', credited_at: '2026-02-01T10:00:00Z', order_id: '1', ...extra });
const op = (id, type, ...transactions) => ({ operation_id: id, operation_type: type, transactions });

test('standalone trade debits are linked rather than added to trade fees a second time', () => {
  const trades = [{ id: 'trade', attributes: { fee: '1', cryptocoin_symbol: 'ETH' } }];
  const operations = [op('buy', 'stock_exchange_buy', tx('trade-cash', 100, { trade: { trade_id: 'trade' } }), tx('fee', 1, { transaction_type: 'fee' }))];
  const result = buildAccountInsights(operations, { ...options, trades });
  assert.equal(result.costs[0].includedTradeId, 'trade');
  assert.equal(result.additionalCostsEur, 0);
});
test('native margin costs use only an API historical EUR value, while credit charges retain their native unit', () => {
  const fee = tx('fee', '.004', { currency_id: undefined, asset_id: 'eth', asset_amount: { value: '.004', asset_id: 'eth' }, wallet_owner: 'margin-trading', transaction_type: 'fee' });
  const charge = tx('charge', 43, { currency_id: undefined, asset_id: 'loan', asset_amount: { value: '43', asset_id: 'loan' }, wallet_owner: 'securities-margin-trading-credit', transaction_type: 'charge' });
  const result = buildAccountInsights([op('close', 'margin_trading_close_long', fee, charge)], { ...options, cryptoTransactions: [{ id: 'fee', attributes: { amount: '.004', amount_eur: '7.66' } }] });
  assert.equal(result.additionalCostsEur, 7.66);
  assert.equal(result.costs.find(c => c.transactionId === 'fee').eurAmount, 7.66);
  assert.equal(result.costs.find(c => c.transactionId === 'charge').eurAmount, null);
  assert.equal(result.unvaluedCosts, 1);
});
test('Earn fees are included once and reward receipts show gross, fee and actual net', () => {
  const reward = tx('reward', 1.41, { flow: 'INCOMING', fee_amount: { value: '.28', currency_id: 'eur' } });
  const result = buildAccountInsights([op('reward', 'earn_on_fiat_reward', reward)], options);
  assert.ok(Math.abs(result.rewards[0].net - 1.13) < 1e-10);
  assert.equal(result.rewards[0].gross, 1.41);
  assert.equal(result.additionalCostsEur, .28);
  assert.equal(result.costs.length, 1);
});
test('source tax is separate from KESt and handles compensating refunds', () => {
  const tax = tx('levy', .18, { transaction_type: 'levy' });
  const refund = tx('refund', .10, { flow: 'INCOMING', compensates: 'levy', compensates_info: { transaction_type: 'levy' } });
  const result = buildAccountInsights([op('div', 'ca_dividend', tax, tx('tax', .32, { transaction_type: 'tax' })), op('refund', 'refund', refund)], options);
  assert.equal(result.sourceTax.totalPaid, .08);
  assert.equal(result.sourceTax.events.length, 2);
  assert.equal(result.costs.length, 0);
});
test('balance checks use net cash movement, isolate wallets and flag gaps as unverified', () => {
  const rows = [tx('start', 100, { flow: 'INCOMING', asset_balance_after: { value: '100' } }), tx('reward', 1.41, { flow: 'INCOMING', order_id: '2', fee_amount: { value: '.28', currency_id: 'eur' }, asset_balance_after: { value: '101.13' } }), tx('bad', 5, { order_id: '3', asset_balance_after: { value: '90' } }), tx('gap', 5, { order_id: '6', asset_balance_after: { value: '85' } })];
  const result = buildAccountInsights([op('cash', 'earn_on_fiat_reward', ...rows)], options);
  assert.equal(result.ledger.find(r => r.id === 'reward').balanceCheck, 'matched');
  assert.equal(result.ledger.find(r => r.id === 'bad').balanceCheck, 'difference');
  assert.equal(result.ledger.find(r => r.id === 'gap').balanceCheck, 'unverified');
});
test('duplicate transactions, internal credits and different reward units are never combined as a cash total', () => {
  const reward = tx('eth-reward', .0001, { currency_id: undefined, asset_id: 'eth', flow: 'INCOMING', wallet_owner: 'staking-service', asset_amount: { value: '.0001', asset_id: 'eth' } });
  const cash = tx('cash-reward', 10, { flow: 'INCOMING' });
  const debt = { ...cash, transaction_id: 'debt', wallet_owner: 'margin-trading-credit' };
  const result = buildAccountInsights([op('rewards', 'reward', reward, cash, debt), op('duplicate', 'reward', reward)], options);
  assert.equal(result.rewards.length, 2);
  assert.equal(result.rewardGroups.length, 2);
  assert.equal(result.rewardGroups.find(g => g.symbol === 'ETH').unvalued, 1);
  assert.equal(result.coverage.transactions, 3);
});
test('portfolio EUR fields are not substituted with zeros or foreign currency values', () => {
  const result = buildAccountInsights([], { ...options, portfolio: [{ asset_id: 'eth', balance: { value: '1' }, invested_amount: { value: '100', currency_id: 'usd' }, average_buy_price: { value: '50', currency_id: 'eur' } }] });
  assert.equal(result.portfolio[0].investedAmount, null);
  assert.equal(result.portfolio[0].currentValue, null);
  assert.equal(result.portfolio[0].averageBuyPrice, 50);
});
test('special events preserve all legs instead of treating conversions as rewards', () => {
  const result = buildAccountInsights([op('merge', 'merger_crypto', tx('from', 1), tx('to', 2, { flow: 'INCOMING' }))], options);
  assert.equal(result.specialOperations[0].transactionIds.length, 2);
  assert.equal(result.rewards.length, 0);
});

test('trading fees paid in a separate token are linked using the API historical EUR debit value', () => {
  const fee = tx('token-fee', 30, { currency_id: undefined, asset_id: 'token', asset_amount: { value: '30', asset_id: 'token' }, transaction_type: 'fee' });
  const trade = tx('sell', 100, { flow: 'INCOMING', trade: { trade_id: 'trade' } });
  const result = buildAccountInsights([op('sell', 'sell', trade, fee)], { ...options, trades: [{ id: 'trade', attributes: { cryptocoin_symbol: 'ETH', fee: '1.34' } }], cryptoTransactions: [{ id: 'token-fee', attributes: { amount: '30', amount_eur: '1.34' } }] });
  assert.equal(result.additionalCostsEur, 0);
  assert.equal(result.costs[0].includedTradeId, 'trade');
});
test('legacy placeholder balances do not produce false reconciliation differences', () => {
  const result = buildAccountInsights([op('placeholder', 'deposit', tx('placeholder', 20, { order_id: '0', asset_balance_after: { value: '-1' } })), op('final', 'deposit', tx('final', 20, { order_id: '1', asset_balance_after: { value: '20' } }))], options);
  assert.equal(result.ledger.find(r => r.id === 'placeholder').balanceAfter, null);
  assert.equal(result.balanceChecks.difference, 0);
});

test('fee refunds reduce additional costs without being confused with tax refunds or rewards', () => {
  const fee = tx('fee', 5, { transaction_type: 'fee' });
  const refund = tx('refund', 2, { flow: 'INCOMING', compensates: 'fee', compensates_info: { transaction_type: 'fee' } });
  const result = buildAccountInsights([op('transfer', 'withdrawal', fee), op('refund', 'refund', refund)], options);
  assert.equal(result.additionalCostsEur, 3);
  assert.equal(result.costs.find(c => c.transactionId === 'refund').amount, -2);
  assert.equal(result.sourceTax.totalPaid, 0);
  assert.equal(result.rewards.length, 0);
});

test('embedded token fees use the exact receipt historical rate and keep unmatched amounts unvalued', () => {
  const reward = tx('reward-eth', 1, { currency_id: undefined, asset_id: 'eth', asset_amount: { value: '1', asset_id: 'eth' }, fee_amount: { value: '.2', asset_id: 'eth' }, flow: 'INCOMING' });
  const inputs = { ...options, cryptoTransactions: [{ id: 'reward-eth', attributes: { amount: '.8', amount_eur: '1600', cryptocoin_symbol: 'ETH' } }] };
  const result = buildAccountInsights([op('reward', 'reward', reward)], inputs);
  assert.equal(result.costs[0].eurAmount, 400);
  assert.equal(result.costs[0].eurSource, 'Berechnet · historischer EUR-Buchungskurs');
  inputs.cryptoTransactions[0].attributes.amount = '.7';
  assert.equal(buildAccountInsights([op('reward', 'reward', reward)], inputs).costs[0].eurAmount, null);
  inputs.cryptoTransactions[0].attributes.amount = '.8';
  inputs.cryptoTransactions[0].attributes.cryptocoin_symbol = 'BTC';
  assert.equal(buildAccountInsights([op('reward', 'reward', reward)], inputs).costs[0].eurAmount, null);
});
