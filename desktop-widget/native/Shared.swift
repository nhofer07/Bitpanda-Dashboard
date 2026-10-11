import Foundation
import SwiftUI
import WidgetKit

let widgetKind = "BitpandaPortfolio"
let dailyGainWidgetKind = "BitpandaDailyGain"
let groupID = "G2H7A7B9CD.com.bitpanda.dashboard.widgets"
struct ConnectionConfig: Codable {
    var homeURL = "http://192.168.0.147:8085"
    var remoteURL = "https://schmhof.synology.me:8445"
    var localURL = ""
    var cookies: [String:String] = [:]
    var username: String?
    func updatingURLs(from draft:ConnectionConfig) -> ConnectionConfig {
        var result=self
        result.homeURL=draft.homeURL
        result.remoteURL=draft.remoteURL
        result.localURL=draft.localURL
        return result
    }
    func sessionCandidates(for base:String) -> [String?] {
        let addresses=[homeURL,remoteURL].contains(base) ? [base,homeURL,remoteURL] : [base]
        var result:[String?]=[]
        for address in addresses {
            if let cookie=cookies[address], !cookie.isEmpty, !result.contains(where:{$0 == cookie}) { result.append(cookie) }
        }
        return result.isEmpty ? [nil] : result
    }
}
struct ChartPoint: Codable { var time: Double; var value: Double }
struct PortfolioState: Codable {
    var value: Double?
    var loadedAt: Date?
    var fetchedAt: Date?
    var points: [ChartPoint] = []
    var change: Double?
    var percent: Double?
    var source = ""
    var offline = false
    var preview = false
    var completeDay = false
    var notice = ""
}
enum SharedStore {
    static var directory: URL {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BitpandaWidget")
    }
    static func load<T:Decodable>(_ name: String, as type:T.Type) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    static func save<T:Encodable>(_ value:T, name:String) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories:true)
        if let data = try? JSONEncoder().encode(value) {
            let file = directory.appendingPathComponent(name)
            try? data.write(to:file, options:.atomic)
            try? FileManager.default.setAttributes([.posixPermissions:0o600], ofItemAtPath:file.path)
        }
    }
    static func saveConfig(_ config:ConnectionConfig) throws {
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let file=directory.appendingPathComponent("connections.json")
        try JSONEncoder().encode(config).write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
    }
    // Settings windows only write their edited URLs, preserving the latest session.
    @MainActor static func updateURLs(_ draft:ConnectionConfig) throws -> ConnectionConfig {
        let merged=config.updatingURLs(from:draft)
        try saveConfig(merged)
        return merged
    }
    @MainActor static func storeSession(_ cookie:String, for base:String, username:String) throws -> ConnectionConfig {
        var latest=config
        latest.cookies[base]=cookie
        latest.username=username
        try saveConfig(latest)
        return latest
    }
    static var config: ConnectionConfig { load("connections.json",as:ConnectionConfig.self) ?? ConnectionConfig() }
}
func parseDate(_ value:Any?) -> Date? {
    guard let value = value as? String else { return nil }
    let f=ISO8601DateFormatter(); f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
    return f.date(from:value) ?? ISO8601DateFormatter().date(from:value)
}
var viennaCalendar: Calendar {
    var c=Calendar(identifier:.gregorian); c.timeZone=TimeZone(identifier:"Europe/Vienna")!; return c
}
func summarize(_ data:[String:Any], overrides:[String:String], now:Date = Date()) throws -> PortfolioState {
    guard let portfolio=data["portfolio"] as? [String:Any], let value=portfolio["totalValue"] as? Double, value.isFinite, let loaded=parseDate(data["loadedAt"]) else { throw URLError(.cannotParseResponse) }
    let start=viennaCalendar.startOfDay(for:now).timeIntervalSince1970
    let historyStart=parseDate(data["portfolioHistoryStartedAt"])?.timeIntervalSince1970 ?? 0
    var byTime:[Double:Double]=[:]
    for item in data["snapshots"] as? [[String:Any]] ?? [] {
        if let t=parseDate(item["createdAt"])?.timeIntervalSince1970, let v=item["totalValue"] as? Double, v.isFinite, t >= historyStart, t <= now.timeIntervalSince1970 { byTime[t]=v }
    }
    byTime[loaded.timeIntervalSince1970]=value
    var today=byTime.filter{$0.key >= start && $0.key <= now.timeIntervalSince1970}.map{ChartPoint(time:$0.key,value:$0.value)}.sorted{$0.time < $1.time}
    let previous=byTime.filter{$0.key < start}.max{$0.key < $1.key}
    let complete=previous != nil || today.first?.time == start
    if !today.isEmpty, let previous, today[0].time > start { today.insert(ChartPoint(time:start,value:previous.value),at:0) }
    var flows:[(Double,Double)]=[]
    for tx in data["transactions"] as? [[String:Any]] ?? [] {
        let a=tx["attributes"] as? [String:Any] ?? [:]
        let time=parseDate((a["time"] as? [String:Any])?["date_iso8601"] ?? a["created_at"] ?? tx["created_at"])?.timeIntervalSince1970
        let amount=abs(Double(String(describing:a["amount"] ?? "0")) ?? 0)
        let type=(a["type"] as? String ?? "").lowercased(), direction=(a["in_or_out"] as? String ?? "").lowercased()
        let fallback=type == "deposit" && direction == "incoming" ? "deposit" : ["withdrawal","transfer"].contains(type) && direction == "outgoing" ? "expense" : "ignore"
        let kind=overrides[tx["id"] as? String ?? ""] ?? fallback
        let signed=kind == "deposit" ? amount : ["withdrawal","expense","transfer"].contains(kind) ? -amount : kind == "refund" ? (fallback == "deposit" ? -amount : amount) : 0
        if let time, let first=today.first, let last=today.last, time > first.time, time <= last.time, signed.isFinite { flows.append((time,signed)) }
    }
    let total=flows.reduce(0){$0+$1.1}
    let adjusted=today.map{p in ChartPoint(time:p.time,value:p.value-flows.filter{$0.0 <= p.time}.reduce(0){$0+$1.1}+total)}
    let change=adjusted.count > 1 ? adjusted.last!.value-adjusted.first!.value : nil
    let percent=change != nil && today[0].value != 0 ? change!/today[0].value*100 : nil
    return PortfolioState(value:value,loadedAt:loaded,points:adjusted,change:change,percent:percent,preview:(data["cache"] as? [String:Any])?["status"] as? String == "local-preview",completeDay:complete)
}
actor PortfolioClient {
    static let shared=PortfolioClient()
    func json(_ base:String, path:String, timeout:Double, cookie:String?) async throws -> [String:Any] {
        guard let url=URL(string:base.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+path), ["http","https"].contains(url.scheme ?? "") else { throw URLError(.badURL) }
        var request=URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:timeout)
        request.setValue("application/json",forHTTPHeaderField:"Accept")
        if let cookie, !cookie.isEmpty { request.setValue(cookie,forHTTPHeaderField:"Cookie") }
        let config=URLSessionConfiguration.ephemeral; config.httpCookieAcceptPolicy = .never; config.httpShouldSetCookies=false; config.timeoutIntervalForResource=timeout
        let session=URLSession(configuration:config); defer{session.invalidateAndCancel()}
        let (body,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse, (200..<300).contains(http.statusCode), http.url?.host == url.host else { throw URLError(.badServerResponse) }
        guard let json=try JSONSerialization.jsonObject(with:body) as? [String:Any] else { throw URLError(.cannotParseResponse) }
        return json
    }
    func refresh() async -> PortfolioState {
        let config=SharedStore.config
        for (name,base,timeout) in [("Heimnetz",config.homeURL,2.0),("Synology",config.remoteURL,5.0),("Lokal",config.localURL,4.0)] where !base.isEmpty {
            do {
                // Home and remote addresses are the same configured Synology.
                // A stale cookie for one address must not hide a newer valid login.
                var cookie:String?
                var connected=false
                for candidate in config.sessionCandidates(for:base) {
                    let auth=try await json(base,path:"/api/auth/status",timeout:timeout,cookie:candidate)
                    guard auth["required"] is Bool, auth["configured"] is Bool else { continue }
                    if auth["authenticated"] as? Bool == true { cookie=candidate; connected=true; break }
                }
                guard connected else { continue }
                let data:[String:Any]
                let overrides:[String:String]
                do {
                    data=try await json(base,path:"/api/widget/portfolio",timeout:15,cookie:cookie)
                    overrides=data["cashflowOverrides"] as? [String:String] ?? [:]
                } catch {
                    // Older Synology versions remain usable before the next deployment.
                    data=try await json(base,path:"/api/dashboard-data",timeout:15,cookie:cookie)
                    let corrections=try await json(base,path:"/api/cashflow-overrides",timeout:timeout,cookie:cookie)
                    overrides=corrections["overrides"] as? [String:String] ?? [:]
                }
                var result=try summarize(data,overrides:overrides); result.source=name; result.fetchedAt=Date()
                SharedStore.save(result,name:"portfolio.json")
                return result
            } catch { continue }
        }
        var result=SharedStore.load("portfolio.json",as:PortfolioState.self) ?? PortfolioState()
        result.offline=true; result.notice="Dashboard nicht erreichbar oder Anmeldung erforderlich"
        if let loaded=result.loadedAt, !viennaCalendar.isDateInToday(loaded) { result.points=[]; result.change=nil; result.percent=nil }
        return result
    }
    func refreshForWidget() async -> PortfolioState {
        if let saved=SharedStore.load("portfolio.json",as:PortfolioState.self), let fresh=freshWidgetState(saved) { return fresh }
        return await refresh()
    }
}

// The next wall-clock boundary, independent of launch time or fetch duration.
func nextWidgetRefresh(after date:Date) -> Date {
    let interval:TimeInterval=5*60
    return Date(timeIntervalSince1970:(floor(date.timeIntervalSince1970/interval)+1)*interval)
}

func freshWidgetState(_ saved:PortfolioState, now:Date=Date()) -> PortfolioState? {
    guard let fetched=saved.fetchedAt, now >= fetched, now < nextWidgetRefresh(after:fetched) else { return nil }
    var result=saved
    if let loaded=result.loadedAt, !viennaCalendar.isDate(loaded,inSameDayAs:now) {
        result.points=[]; result.change=nil; result.percent=nil; result.completeDay=false
    }
    return result
}

func widgetTime(_ date:Date, includeDate:Bool=false) -> String {
    let f=DateFormatter(); f.locale=Locale(identifier:"de_AT"); f.timeZone=TimeZone(identifier:"Europe/Vienna"); f.dateFormat=includeDate ? "dd.MM., HH:mm" : "HH:mm"; return f.string(from:date)
}
func changeLabel(_ change:Double,percent:Double?) -> String {
    let amount=change.formatted(.currency(code:"EUR").locale(Locale(identifier:"de_AT")))
    var result=(change >= 0 ? "+" : "") + amount
    if let percent {
        let number=percent.formatted(.number.precision(.fractionLength(2)).locale(Locale(identifier:"de_AT")))
        result += " (" + (percent >= 0 ? "+" : "") + number + " %)"
    }
    return result
}
struct PortfolioCard: View {
    var state:PortfolioState
    var positive:Bool { (state.change ?? 0) >= 0 }
    var tint:Color { positive ? Color(red:0.34,green:0.85,blue:0.61) : .red }
    var body: some View {
        VStack(alignment:.leading,spacing:4) {
            HStack {
                Text("BITPANDA").font(.system(size:10,weight:.bold)).tracking(1).foregroundStyle(tint)
                Spacer()
                Text(state.offline ? "Offline" : state.preview ? "Vorschau" : state.source).font(.system(size:8)).foregroundStyle(.secondary)
            }
            Text(state.value.map{ $0.formatted(.currency(code:"EUR").locale(Locale(identifier:"de_AT"))) } ?? "—")
                .font(.system(size:26,weight:.semibold,design:.rounded)).minimumScaleFactor(0.6).lineLimit(1).privacySensitive()
            Text("Portfolio inkl. Guthaben").font(.system(size:9)).foregroundStyle(.secondary)
            if let change=state.change {
                Text(changeLabel(change, percent:state.percent))
                    .font(.system(size:10,weight:.medium)).foregroundStyle(tint).minimumScaleFactor(0.7).lineLimit(1).privacySensitive()
            }
            if state.points.count > 1 {
                Canvas { context,size in
                    let values=state.points.map(\.value), lo=values.min()!, hi=values.max()!
                    let span=max(hi-lo,max(abs(hi)*0.001,1))
                    let first=state.points.first!.time, duration=max(state.points.last!.time-first,1)
                    let positions=state.points.map{CGPoint(x:($0.time-first)/duration*size.width,y:size.height-4-($0.value-lo)/span*(size.height-8))}
                    var path=Path(); path.addLines(positions)
                    var area=path; area.addLine(to:CGPoint(x:size.width,y:size.height)); area.addLine(to:CGPoint(x:0,y:size.height)); area.closeSubpath()
                    context.fill(area,with:.linearGradient(Gradient(colors:[tint.opacity(0.3),tint.opacity(0)]),startPoint:.zero,endPoint:CGPoint(x:0,y:size.height)))
                    context.stroke(path,with:.color(tint),style:StrokeStyle(lineWidth:1.8,lineCap:.round,lineJoin:.round))
                }.frame(maxHeight:.infinity).privacySensitive().accessibilityLabel("Heutiger cashflow-bereinigter Portfolioverlauf")
            } else {
                Text(state.loadedAt == nil ? "Dashboard verbinden" : state.points.isEmpty ? "Keine heutigen Daten" : "Aufzeichnung beginnt …").font(.system(size:10)).foregroundStyle(.secondary).frame(maxHeight:.infinity)
            }
            HStack {
                Text(state.completeDay || state.points.isEmpty ? "Heute" : "Ab \(widgetTime(Date(timeIntervalSince1970:state.points.first!.time)))")
                Spacer()
                if let loaded=state.loadedAt { Text(widgetTime(loaded,includeDate:true)) }
            }.font(.system(size:8)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

func dailyGainPoints(_ state:PortfolioState) -> [ChartPoint] {
    guard let first=state.points.first else { return [] }
    return state.points.map { ChartPoint(time:$0.time,value:$0.value-first.value) }
}

struct DailyGainCard: View {
    var state:PortfolioState
    var positive:Bool { (state.change ?? 0) >= 0 }
    var tint:Color { positive ? Color(red:0.34,green:0.85,blue:0.61) : .red }
    var body: some View {
        VStack(alignment:.leading,spacing:4) {
            HStack {
                Text("TAGESGEWINN").font(.system(size:10,weight:.bold)).tracking(1).foregroundStyle(tint)
                Spacer()
                Text(state.offline ? "Offline" : state.preview ? "Vorschau" : state.source).font(.system(size:8)).foregroundStyle(.secondary)
            }
            Text(state.change.map { changeLabel($0,percent:nil) } ?? "—")
                .font(.system(size:26,weight:.semibold,design:.rounded)).minimumScaleFactor(0.6).lineLimit(1).foregroundStyle(state.change == nil ? Color.secondary : tint).privacySensitive()
            Text(state.percent.map { ($0 >= 0 ? "+" : "") + $0.formatted(.number.precision(.fractionLength(2)).locale(Locale(identifier:"de_AT"))) + " %" } ?? "— %")
                .font(.system(size:12,weight:.medium)).foregroundStyle(tint).privacySensitive()
            if state.points.count > 1 {
                Canvas { context,size in
                    let points=dailyGainPoints(state), values=points.map(\.value)
                    let lo=min(values.min()!,0), hi=max(values.max()!,0)
                    let padding=max((hi-lo)*0.1,0.5), lower=lo-padding, span=hi-lo+padding*2
                    let first=points.first!.time, duration=max(points.last!.time-first,1)
                    func y(_ value:Double) -> Double { size.height-4-(value-lower)/span*(size.height-8) }
                    var zero=Path(); zero.move(to:CGPoint(x:0,y:y(0))); zero.addLine(to:CGPoint(x:size.width,y:y(0)))
                    context.stroke(zero,with:.color(.white.opacity(0.25)),style:StrokeStyle(lineWidth:0.7,dash:[3,3]))
                    let positions=points.map { CGPoint(x:($0.time-first)/duration*size.width,y:y($0.value)) }
                    var path=Path(); path.addLines(positions)
                    context.stroke(path,with:.color(tint),style:StrokeStyle(lineWidth:1.8,lineCap:.round,lineJoin:.round))
                }.frame(maxHeight:.infinity).privacySensitive().accessibilityLabel("Heutiger cashflow-bereinigter Gewinnverlauf, beginnend bei null Euro")
            } else {
                Text(state.loadedAt == nil ? "Dashboard verbinden" : state.points.isEmpty ? "Keine heutigen Daten" : "Aufzeichnung beginnt …").font(.system(size:10)).foregroundStyle(.secondary).frame(maxHeight:.infinity)
            }
            Text("Cashflow-bereinigt · inkl. Guthaben").font(.system(size:8)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
            HStack {
                Text(state.completeDay || state.points.isEmpty ? "Heute" : "Ab \(widgetTime(Date(timeIntervalSince1970:state.points.first!.time)))")
                Spacer()
                if let loaded=state.loadedAt { Text(widgetTime(loaded,includeDate:true)) }
            }.font(.system(size:8)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}
