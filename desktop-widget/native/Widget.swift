import SwiftUI
import WidgetKit

struct PortfolioEntry: TimelineEntry { let date:Date; let state:PortfolioState }
struct PortfolioProvider: TimelineProvider {
    func placeholder(in context:Context) -> PortfolioEntry { PortfolioEntry(date:Date(),state:PortfolioState()) }
    func getSnapshot(in context:Context,completion:@escaping(PortfolioEntry)->Void) {
        if context.isPreview { completion(PortfolioEntry(date:Date(),state:SharedStore.load("portfolio.json",as:PortfolioState.self) ?? PortfolioState())); return }
        Task{let state=await PortfolioClient.shared.refreshForWidget();completion(PortfolioEntry(date:Date(),state:state))}
    }
    func getTimeline(in context:Context,completion:@escaping(Timeline<PortfolioEntry>)->Void) {
        Task {
            let state=await PortfolioClient.shared.refreshForWidget()
            let entry=PortfolioEntry(date:Date(),state:state)
            completion(Timeline(entries:[entry],policy:.after(nextWidgetRefresh(after:entry.date))))
        }
    }
}
@main struct BitpandaWidgets: WidgetBundle {
    var body: some Widget {
        BitpandaPortfolioWidget()
        BitpandaDailyGainWidget()
    }
}
struct BitpandaPortfolioWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:widgetKind,provider:PortfolioProvider()) { entry in
            PortfolioCard(state:entry.state)
                .containerBackground(for:.widget){Color(red:0.07,green:0.14,blue:0.12)}
                .environment(\.colorScheme,.dark)
                .widgetURL(URL(string:"bitpandawidget://settings"))
        }
        .configurationDisplayName("Bitpanda")
        .description("Dein Portfoliowert und geprüfter, cashflow-bereinigter Verlauf.")
        .supportedFamilies([.systemSmall])
    }
}

struct BitpandaDailyGainWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:dailyGainWidgetKind,provider:PortfolioProvider()) { entry in
            DailyGainCard(state:entry.state)
                .containerBackground(for:.widget){Color(red:0.07,green:0.14,blue:0.12)}
                .environment(\.colorScheme,.dark)
                .widgetURL(URL(string:"bitpandawidget://settings"))
        }
        .configurationDisplayName("Bitpanda Tagesgewinn")
        .description("Dein Gewinn oder Verlust im angezeigten Zeitraum mit geprüftem, cashflow-bereinigtem Chart.")
        .supportedFamilies([.systemSmall,.systemMedium])
    }
}
