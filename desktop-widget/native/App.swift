import SwiftUI
import WidgetKit

@main struct BitpandaEntryPoint {
    @MainActor static func main() async {
        if CommandLine.arguments.contains("--refresh-widgets") {
            NSApplication.shared.setActivationPolicy(.prohibited)
            let state=await PortfolioClient.shared.refresh()
            SharedStore.save(state,name:"portfolio.json")
            WidgetCenter.shared.reloadAllTimelines()
            print(state.offline ? "Widgets: Offline" : "Widgets: Verbunden (\(state.source))")
            print("Abruf: \(state.fetchedAt?.ISO8601Format() ?? "unbekannt") · Datenstand: \(state.loadedAt?.ISO8601Format() ?? "unbekannt") · \(state.points.count) Messpunkte · \(state.periodLabel ?? (state.completeDay ? "Heute" : "Teilzeitraum"))")
            exit(state.offline ? 1 : 0)
        }
        // Only an explicitly opened settings window should appear in the Dock.
        NSApplication.shared.setActivationPolicy(.regular)
        BitpandaWidgetApp.main()
    }
}
struct BitpandaWidgetApp: App {
    var body: some Scene {
        WindowGroup("Bitpanda Widget") { SettingsView().frame(width:480,height:560) }
        .windowResizability(.contentSize)
    }
}
struct SettingsView: View {
    @State private var config=SharedStore.config
    @State private var state=SharedStore.load("portfolio.json",as:PortfolioState.self) ?? PortfolioState()
    @State private var loading=false
    @State private var message=""
    @State private var loginURL=""
    @State private var username=SharedStore.config.username ?? ""
    @State private var password=""
    @State private var showLogin=false
    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            HStack(alignment:.top) {
                VStack(alignment:.leading,spacing:6) {
                    Text("Bitpanda auf deinem Desktop").font(.title2.bold())
                    Text("Rechtsklick auf den Desktop → Widgets bearbeiten → Bitpanda.").font(.callout).foregroundStyle(.secondary)
                    Text("Das Widget lässt sich wie Wetter verschieben. macOS steuert die Aktualisierung.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            PortfolioCard(state:state).padding(14).frame(width:170,height:170).background(Color(red:0.07,green:0.14,blue:0.12),in:RoundedRectangle(cornerRadius:22)).environment(\.colorScheme,.dark)
            Grid(alignment:.leading,horizontalSpacing:10,verticalSpacing:10) {
                GridRow { Text("Heimnetz"); TextField("http://192.168.0.147:8085",text:$config.homeURL); Button("Anmelden"){loginURL=config.homeURL;showLogin=true} }
                GridRow { Text("Unterwegs"); TextField("Synology-/Tailscale-Adresse",text:$config.remoteURL); Button("Anmelden"){loginURL=config.remoteURL;showLogin=true}.disabled(config.remoteURL.isEmpty) }
                GridRow { Text("Lokal"); TextField("Deaktiviert",text:$config.localURL); Text("Vorschau").foregroundStyle(.secondary) }
            }.textFieldStyle(.roundedBorder).font(.caption)
            HStack {
                Button(loading ? "Aktualisiere …" : "Speichern & aktualisieren") { Task{await refresh()} }.disabled(loading)
                Spacer()
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
            Text("Verbindung: Heimnetz → Synology → lokal. Ohne Verbindung zeigt das Widget den letzten Stand als Offline. Das Passwort wird nicht gespeichert.").font(.caption).foregroundStyle(.secondary)
            Spacer(minLength:0)
        }.padding(24).task{await refresh()}
        .sheet(isPresented:$showLogin) {
            VStack(alignment:.leading,spacing:14) {
                Text("Dashboard anmelden").font(.headline)
                Text(loginURL).font(.caption).textSelection(.enabled)
                TextField("Dashboard-Benutzername",text:$username)
                SecureField("Dashboard-Passwort",text:$password)
                Text("Verwende das Dashboard-Passwort, keinen Bitpanda API-Key.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Abbrechen"){password="";showLogin=false}
                    Spacer()
                    Button("Anmelden") { Task{await signIn()} }.disabled(username.isEmpty || password.isEmpty || loading)
                }
            }.textFieldStyle(.roundedBorder).padding(24).frame(width:380)
        }
    }
    @MainActor func refresh() async {
        loading=true; message=""
        config.homeURL=config.homeURL.trimmingCharacters(in:.whitespacesAndNewlines).trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        config.remoteURL=config.remoteURL.trimmingCharacters(in:.whitespacesAndNewlines).trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        config.localURL=config.localURL.trimmingCharacters(in:.whitespacesAndNewlines).trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        do { config=try SharedStore.updateURLs(config) }
        catch { message="Einstellungen konnten nicht gespeichert werden"; loading=false; return }
        state=await PortfolioClient.shared.refresh()
        WidgetCenter.shared.reloadAllTimelines()
        message=state.offline ? "Offline / Anmeldung prüfen" : "Verbunden: \(state.source)"
        loading=false
    }
    @MainActor func signIn() async {
        loading=true
        do {
            config=try SharedStore.updateURLs(config)
            loginURL=loginURL.trimmingCharacters(in:.whitespacesAndNewlines).trimmingCharacters(in:CharacterSet(charactersIn:"/"))
            guard let base=URL(string:loginURL), ["http","https"].contains(base.scheme ?? ""), base.user == nil, base.password == nil, let url=URL(string:loginURL + "/api/auth/login") else { throw URLError(.badURL) }
            var request=URLRequest(url:url,timeoutInterval:15); request.httpMethod="POST"
            request.setValue("application/json",forHTTPHeaderField:"Content-Type")
            request.httpBody=try JSONSerialization.data(withJSONObject:["username":username,"password":password])
            let session=URLSession(configuration:.ephemeral); defer{session.invalidateAndCancel()}
            let (data,response)=try await session.data(for:request)
            guard let http=response as? HTTPURLResponse, http.url?.host == base.host, http.statusCode == 200, let body=try JSONSerialization.jsonObject(with:data) as? [String:Any], body["authenticated"] as? Bool == true else { throw URLError(.userAuthenticationRequired) }
            let fields=http.allHeaderFields.reduce(into:[String:String]()){result,pair in if let key=pair.key as? String, let value=pair.value as? String{result[key]=value}}
            let cookies=HTTPCookie.cookies(withResponseHeaderFields:fields,for:url)
            guard let cookie=cookies.first(where:{$0.name == "bd_session"}) else { throw URLError(.userAuthenticationRequired) }
            config=try SharedStore.storeSession("bd_session=\(cookie.value)",for:loginURL,username:username)
            password=""; showLogin=false; await refresh()
        } catch { password="";message="Anmeldung fehlgeschlagen";loading=false;showLogin=false }
    }
}
