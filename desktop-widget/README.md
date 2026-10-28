# Native Bitpanda desktop widget

The native app is installed at `~/Applications/Bitpanda Widget.app`. It includes a WidgetKit extension named **Bitpanda**, available through **Right-click desktop → Edit Widgets**. It supports Apple's normal widget dragging, desktop placement, and layering.

Open **Bitpanda Widget** to configure connections and log in to the dashboard. The configured routes are:
- Home: `http://192.168.0.147:8085`
- Away: `https://schmhof.synology.me:8445`
- Local fallback is disabled for Synology verification.

A per-user LaunchAgent (`com.bitpanda.local.widget.refresh`) fetches fresh data at five-minute clock boundaries (:00, :05, :10, …, :55) through the approved app identity, without opening a window or appearing in the Dock. The app launches as a macOS agent; only opening its settings enables a Dock icon. Widgets read this shared snapshot, avoiding macOS local-network failures in the extension. The updater starts automatically at login. If a fetch fails, the saved data remains explicitly Offline; cached online status expires at the next five-minute boundary. The extension requests a fresh timeline at that same boundary, and successful background fetches also request a refresh. macOS decides the actual display refresh time; exact five-minute widget rendering is not guaranteed. The last portfolio update is shown on the widget. No continuously running dashboard browser or overlay is required.

The additional **Bitpanda Tagesgewinn** widget shows gain/loss in EUR and percent,
with a chart starting at zero. Both widgets use the same checked, cashflow-adjusted
series as the dashboard: the official 24-hour history when current, or the saved
Vienna-calendar-day history when it is unavailable. The period is shown explicitly.
The current portfolio balance remains separate and is never appended to an official
series. API bucket closing times determine cashflow assignment. Isolated errors are
corrected only against corroborating saved observations; both widgets show a
correction count and the last chart measurement time in their aligned footers.
A single daily value alone cannot invalidate an intraday spike. Percentages follow
the dashboard and are omitted when no reliable value is available.

The gain widget is available in small and medium sizes through **Right-click desktop
→ Edit Widgets → Bitpanda → Bitpanda Tagesgewinn**, and reuses the existing login.
The server sends the prepared chart in `/api/widget/portfolio`; older server versions
continue using the legacy daily calculation until the server update is deployed.

Dashboard passwords are not stored. App and extension share connection settings, session cookies, and the last displayed portfolio data in a private app-group container. Both Synology addresses refer to the same dashboard; the widget can reuse the home session at the configured remote address. With the updated backend, session hashes are stored in the persistent Synology data volume and remain valid after container restarts and updates. Sessions expire after 30 days without use; active widget sessions renew automatically. Logout and credential changes revoke access. Existing sessions issued by the previous backend require one new login after deployment. Settings saves preserve the newest stored session, and home/remote routing tries either configured Synology session when one is stale. The username is remembered; the password remains unsaved.

The native source is in `native/`. Build and install with `python3 native/install.py` on this Mac (Xcode and a valid Apple Development signing identity are needed). `native/Validate.swift` checks the cashflow, baseline, and stale-date logic. The backend's `/api/widget/portfolio` endpoint reduces transfer size; existing Synology versions still work through the regular dashboard endpoint until their next update.

## Earlier Übersicht version


The widget shows the total portfolio value including cash, today's cashflow-adjusted portfolio chart, its change, and the last portfolio update. It refreshes every minute in Übersicht.

Installed on this Mac:
- App: `~/Applications/Übersicht.app`
- Widget: `~/Library/Application Support/Übersicht/widgets/bitpanda/`
- Private configuration and sessions: `~/.bitpanda-dashboard/desktop-widget/`

Connection order:
1. Home dashboard: `http://192.168.0.147:8085`
2. Remote dashboard: configure your actual reachable Synology or Tailscale URL.
3. Local review: `http://127.0.0.1:3001` (local backend must be running).
4. Saved widget value, explicitly labelled Offline.

Run `Widget einrichten.command` to enter the remote URL and sign in to the dashboard. Enter the dashboard account password in Terminal, not a Bitpanda API key. Passwords are not stored. The widget keeps an owner-readable session cookie for each connection. A server restart may require signing in again. Remote access must already work through your VPN or secure remote URL.

Open Übersicht to show the widget. Closing Übersicht hides it. Position and styling are in `bitpanda.jsx` (`top` and `left`).

The chart uses actual snapshots from today's Vienna calendar date. It never relabels yesterday's data as today's. With no midnight baseline it labels the chart as starting from today's first recording. Deposits and withdrawals use the dashboard's saved cashflow corrections. Browser-only unsaved corrections are unavailable to the widget.

To copy this widget to another Mac, install Übersicht from https://tracesof.net/uebersicht/, then copy `bitpanda.jsx` and the `lib` directory into `~/Library/Application Support/Übersicht/widgets/bitpanda/`. Configure each Mac separately. No credentials or private portfolio data are included in this project.
