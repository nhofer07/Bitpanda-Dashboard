import Foundation
@main struct Validate {
 static func main() throws {
  let data:[String:Any]=["loadedAt":"2026-10-06T10:00:00Z","portfolio":["totalValue":1150.0],"snapshots":[["createdAt":"2026-10-05T21:00:00Z","totalValue":1000.0],["createdAt":"2026-10-06T08:00:00Z","totalValue":1100.0]],"transactions":[["id":"deposit","attributes":["type":"deposit","in_or_out":"incoming","amount":"100","created_at":"2026-10-06T07:00:00Z"]]]]
  let now=parseDate("2026-10-06T12:00:00Z")!
  let result=try summarize(data,overrides:[:],now:now)
  precondition(result.value == 1150 && result.change == 50 && result.percent == 5)
  precondition(result.points.first!.value == 1100 && result.points.last!.value == 1150 && result.completeDay)
  var prepared=data
  prepared["chart"]=["version":1,"periodLabel":"Heute","lastPointAt":"2026-10-06T09:00:00Z","points":[["time":now.timeIntervalSince1970-7200,"value":1200.0],["time":now.timeIntervalSince1970-3600,"value":1250.0]],"change":50.0,"percent":NSNull(),"corrections":[["originalValue":1500.0]]]
  let verified=try summarize(prepared,overrides:[:],now:now)
  precondition(verified.value == 1150 && verified.points.last!.value == 1250)
  precondition(verified.points.count == 2 && verified.change == 50 && verified.percent == nil)
  precondition(verified.periodLabel == "Heute" && verified.correctionCount == 1)
  let oldPrepared=try summarize(prepared,overrides:[:],now:now.addingTimeInterval(86400))
  precondition(oldPrepared.points.isEmpty)
  var old24=prepared
  var oldChart=old24["chart"] as! [String:Any]
  oldChart["periodLabel"]="24 Stunden"
  old24["chart"]=oldChart
  let migrated=try summarize(old24,overrides:[:],now:now)
  precondition(migrated.points.last!.value == 1150 && migrated.change == 50)
  var oldCached=verified; oldCached.periodLabel="24 Stunden"; oldCached.fetchedAt=now
  precondition(freshWidgetState(oldCached,now:now) == nil)
  let gains=dailyGainPoints(result)
  precondition(gains.first!.value == 0 && gains.last!.value == 50)
  precondition(gains.map(\.time) == result.points.map(\.time))
  var loss=result; loss.points=[ChartPoint(time:0,value:1000),ChartPoint(time:1,value:975)]
  precondition(dailyGainPoints(loss).last!.value == -25)
  precondition(dailyGainPoints(PortfolioState()).isEmpty)
  var fresh=result; fresh.fetchedAt=now
  precondition(freshWidgetState(fresh,now:now.addingTimeInterval(60))?.offline == false)
  precondition(freshWidgetState(fresh,now:now.addingTimeInterval(299))?.offline == false)
  precondition(freshWidgetState(fresh,now:now.addingTimeInterval(300)) == nil)
  precondition(nextWidgetRefresh(after:now) == now.addingTimeInterval(300))
  precondition(nextWidgetRefresh(after:now.addingTimeInterval(299.9)) == now.addingTimeInterval(300))
  precondition(nextWidgetRefresh(after:now.addingTimeInterval(300)) == now.addingTimeInterval(600))
  let beforeMidnight=parseDate("2026-10-06T21:59:59Z")!
  precondition(nextWidgetRefresh(after:beforeMidnight) == parseDate("2026-10-06T22:00:00Z")!)
  fresh.fetchedAt=now.addingTimeInterval(299)
  precondition(freshWidgetState(fresh,now:now.addingTimeInterval(300)) == nil)
  precondition(freshWidgetState(fresh,now:now) == nil)
  precondition(freshWidgetState(result,now:now) == nil)
  fresh.fetchedAt=now
  fresh.offline=true
  precondition(freshWidgetState(fresh,now:now)?.offline == true)
  fresh.fetchedAt=now.addingTimeInterval(86400)
  let nextDay=freshWidgetState(fresh,now:now.addingTimeInterval(86400))!
  precondition(nextDay.points.isEmpty && nextDay.change == nil && nextDay.percent == nil)
  let stale=try summarize(data,overrides:[:],now:now.addingTimeInterval(86400))
  precondition(stale.points.isEmpty && stale.change == nil)
  let corrected=try summarize(data,overrides:["deposit":"ignore"],now:now)
  precondition(corrected.change == 150)
  let legacy=Data(#"{"homeURL":"http://home","remoteURL":"https://remote","localURL":"","cookies":{"http://home":"fresh","https://remote":"stale"}}"#.utf8)
  let saved=try JSONDecoder().decode(ConnectionConfig.self,from:legacy)
  precondition(saved.username == nil)
  var staleWindow=saved; staleWindow.cookies=["http://home":"obsolete"]; staleWindow.localURL="http://local"
  let merged=saved.updatingURLs(from:staleWindow)
  precondition(merged.cookies["http://home"] == "fresh" && merged.localURL == "http://local")
  precondition(merged.sessionCandidates(for:"https://remote") == ["stale","fresh"])
  precondition(merged.sessionCandidates(for:"http://local") == [nil])
  let roundtrip=try JSONDecoder().decode(ConnectionConfig.self,from:JSONEncoder().encode(merged))
  precondition(roundtrip.cookies == saved.cookies)
  print("Native session checks pass: legacy settings, stale-window merge, home/remote fallback, local isolation.")
  print("Native portfolio calculations pass: cashflows, current value, overrides, stale-day handling.")
  print("Native refresh checks pass: five-minute clock boundaries, rollover, cache expiration.")
 }
}
