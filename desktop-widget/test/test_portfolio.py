import datetime as dt
import sys
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from portfolio import summarize

class PortfolioTests(unittest.TestCase):
    def data(self):
        return {'loadedAt':'2026-10-06T10:00:00Z', 'portfolio':{'totalValue':1150}, 'snapshots':[
            {'createdAt':'2026-10-05T21:00:00Z','totalValue':1000},
            {'createdAt':'2026-10-06T08:00:00Z','totalValue':1100}], 'transactions':[
            {'id':'deposit','attributes':{'type':'deposit','in_or_out':'incoming','amount':'100','created_at':'2026-10-06T07:00:00Z'}}]}
    def now(self):
        return dt.datetime(2026,10,6,14,tzinfo=ZoneInfo('Europe/Vienna'))
    def test_cashflow_neutral_chart_matches_real_current_value(self):
        result = summarize(self.data(), now=self.now())
        self.assertEqual(result['points'][0][1],1100)
        self.assertEqual(result['points'][-1][1],1150)
        self.assertEqual(result['change'],50)
        self.assertEqual(result['percent'],5)
        self.assertTrue(result['completeDay'])
    def test_stale_saved_portfolio_is_not_presented_as_today_chart(self):
        result = summarize(self.data(), now=self.now()+dt.timedelta(days=1))
        self.assertEqual(result['points'],[])
        self.assertIsNone(result['change'])
    def test_cashflow_override_is_respected(self):
        result = summarize(self.data(), {'deposit':'ignore'}, now=self.now())
        self.assertEqual(result['change'],150)
    def test_first_point_does_not_invent_a_midnight_balance(self):
        data=self.data();data['snapshots']=[]
        result=summarize(data, now=self.now())
        self.assertEqual(len(result['points']),1)
        self.assertFalse(result['completeDay'])
        self.assertIsNone(result['change'])

if __name__ == '__main__':
    unittest.main()
