import { ANALYSIS_HORIZONS } from "./analysis-horizons.js";
import { createChatGPT, analysisPrompt } from "./chatgpt.js";
import { sendCompressedJson } from "./compressed-json.js";
import { createHistoryReadCache } from "./history-read-cache.js";
import { createAccountAssetCatalog } from "./account-asset-catalog.js";
import { createReadDeduplicator } from "./read-deduplication.js";
import { createDashboardEvents } from "./dashboard-events.js";
import { PORTFOLIO_TIMEFRAMES, normalizePortfolioHistory, createPortfolioHistoryLoader } from "./portfolio-api-history.js";
import { catalogCategory, enrichTradeAssetIdentity } from "./asset-identity.js";
import { createCashflowStore } from "./cashflow-store.js";
import { enrichTradesWithLeverageFees } from "./leverage-fees.js";
import { loadBitpandaChart } from "./bitpanda-chart.js";
import { applyReportedPortfolio, valueOpenPosition, accountAssetTicker } from "./reported-portfolio.js";
import { openAuthSessions } from "./auth-sessions.js";
import { readDashboardCache, writeDashboardCache, writeJsonAtomically } from "./json-storage.js";
import { portfolioSnapshotIssue, excludeCorrectedSnapshots } from "./portfolio-history.js";
import { compactWidgetData } from "./widget-data.js";
import { localPortfolioPreview } from "./local-preview.js";
import { loadAssetCatalog, searchCatalog } from "./asset-search.js";
import { loadMarketHistory, resolveMarketSymbol, normalizeMarketUnit, HISTORY_RANGES } from "./market-history.js";
import { cleanUuid } from "./id-validation.js";
import { buildFusionOrder, requestFusion } from "./fusion-orders.js";
import { fetchPublicPages } from "./public-pagination.js";
import { buildAccountInsights } from "./account-insights.js";
import { calculatePaidTax } from "./paid-tax.js";
import { reportedTradeFee, tradeValueBeforeFee, enrichTradesWithBookedFees, allocateSalePurchaseFees } from "./trade-amounts.js";
import express from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DASHBOARD_DATA_DIR || path.join(os.homedir(), ".bitpanda-dashboard");
await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const PERSIST_CREDENTIALS = process.env.CREDENTIALS_STORAGE !== "memory";
const AUTH_REQUIRED = process.env.DASHBOARD_AUTH === "required";
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const scryptAsync = promisify(scrypt);
let authConfig = null;
try { authConfig = JSON.parse(await fs.readFile(AUTH_FILE, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const authSessions = await openAuthSessions({
  file: path.join(DATA_DIR, "auth-sessions.json"),
  account: () => authConfig ? createHash("sha256").update(JSON.stringify([authConfig.username, authConfig.salt, authConfig.hash])).digest("hex") : null,
  onError: () => console.error("Anmeldesitzungen konnten nicht dauerhaft gespeichert oder geladen werden.")
});
const loginAttempts = new Map();
let creatingAuth = false;
let credentials = {};
if (PERSIST_CREDENTIALS) {
  try { credentials = JSON.parse(await fs.readFile(CREDENTIALS_FILE, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
// Move legacy secrets out of the distributable project, without logging values.
const legacyFile = path.join(__dirname, ".env");
if (PERSIST_CREDENTIALS) {
  try {
    const legacyText = await fs.readFile(legacyFile, "utf8");
    const legacy = dotenv.parse(legacyText);
    if (legacy.BITPANDA_API_KEY || legacy.FINNHUB_API_KEY || legacy.FUSION_API_KEY) {
      credentials.bitpanda ||= legacy.BITPANDA_API_KEY?.trim() || "";
      credentials.finnhub ||= legacy.FINNHUB_API_KEY?.trim() || "";
      credentials.fusion ||= legacy.FUSION_API_KEY?.trim() || "";
      await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials), { mode: 0o600 });
      await fs.chmod(CREDENTIALS_FILE, 0o600);
      await fs.writeFile(legacyFile, legacyText.replace(/^\s*(?:export\s+)?(?:BITPANDA_API_KEY|FINNHUB_API_KEY|FUSION_API_KEY)\s*=.*(?:\r?\n|$)/gm, ""));
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
let apiKey = credentials.bitpanda || "";
let finnhubApiKey = credentials.finnhub || "";
let fusionApiKey = credentials.fusion || "";
function accountDir() {
  // Synology runs one isolated container per person and deliberately keeps the
  // API key only in browser/container memory. A key-derived directory would
  // therefore change after every key rotation and make the chart look reset.
  if (!PERSIST_CREDENTIALS) return path.join(DATA_DIR, "account");
  return path.join(DATA_DIR, "accounts", createHash("sha256").update(apiKey || "unconfigured").digest("hex"));
}
await fs.mkdir(accountDir(), { recursive: true, mode: 0o700 });

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function migrateSynologyKeyedHistory() {
  if (PERSIST_CREDENTIALS) return;
  const stableDir = accountDir();
  const stableCache = path.join(stableDir, ".cache", "dashboard-data.json");
  if (await exists(stableCache)) return;
  const legacyAccountsDir = path.join(DATA_DIR, "accounts");
  let entries = [];
  try { entries = await fs.readdir(legacyAccountsDir, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(legacyAccountsDir, entry.name);
    const cacheFile = path.join(dir, ".cache", "dashboard-data.json");
    try {
      const data = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      candidates.push({ dir, snapshots: Array.isArray(data.snapshots) ? data.snapshots.length : 0, loadedAt: Date.parse(data.loadedAt || "") || 0 });
    } catch { /* Ignore empty, corrupt or unrelated legacy account folders. */ }
  }
  candidates.sort((a, b) => b.snapshots - a.snapshots || b.loadedAt - a.loadedAt);
  const source = candidates[0]?.dir;
  if (!source) return;
  const sourceCache = path.join(source, ".cache");
  const targetCache = path.join(stableDir, ".cache");
  if (await exists(sourceCache) && !(await exists(targetCache))) await fs.cp(sourceCache, targetCache, { recursive: true, force: false });
  const sourceManual = path.join(source, "manual-positions.json");
  const targetManual = path.join(stableDir, "manual-positions.json");
  if (await exists(sourceManual) && !(await exists(targetManual))) await fs.copyFile(sourceManual, targetManual);
  const sourceCashflows = path.join(source, "cashflow-overrides.json");
  const targetCashflows = path.join(stableDir, "cashflow-overrides.json");
  if (await exists(sourceCashflows) && !(await exists(targetCashflows))) await fs.copyFile(sourceCashflows, targetCashflows);
}
await migrateSynologyKeyedHistory();
async function moveLegacyData(source, destination) {
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EEXIST") return;
    if (error.code !== "EXDEV") throw error;
    try {
      await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
      await fs.rm(source, { recursive: true, force: true });
    } catch (copyError) {
      if (!["EEXIST", "ENOENT"].includes(copyError.code)) throw copyError;
    }
  }
}
for (const name of [".cache", "manual-positions.json", "cashflow-overrides.json"]) {
  await moveLegacyData(path.join(__dirname, name), path.join(accountDir(), name));
}



const app = express();
app.use((req, res, next) => {
  const configuredHosts = (process.env.ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]").split(",").map(value => value.trim()).filter(Boolean);
  const allowedHosts = new Set(configuredHosts);
  try {
    const requestHost = new URL(`http://${req.headers.host}`);
    if (!allowedHosts.has("*") && !allowedHosts.has(requestHost.hostname)) return res.sendStatus(403);
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      const sameOrigin = origin.host === requestHost.host;
      const developmentOrigin = ["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin.origin);
      if (!sameOrigin && !developmentOrigin) return res.sendStatus(403);
    }
    if (req.headers["sec-fetch-site"] === "cross-site") return res.sendStatus(403);
  } catch { return res.sendStatus(403); }
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(express.static(path.join(__dirname, "..", "frontend", "dist"), {
  setHeaders(res, file) {
    // Vite fingerprints assets. Cache those across reloads; always revalidate
    // HTML and manifests so a deployment immediately points to the new bundle.
    res.setHeader("Cache-Control", /[-][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(file) ? "public, max-age=31536000, immutable" : "no-cache");
  }
}));
app.use((req, res, next) => {
  if (req.url === "/api") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  next();
});
app.use(express.json());

function sessionToken(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || "").split(";").map(item => item.trim().split(/=(.*)/s, 2)).filter(item => item[0]));
  return cookies.bd_session || "";
}

function authenticated(req) {
  if (!AUTH_REQUIRED) return true;
  return authSessions.authenticated(sessionToken(req));
}

async function createSession(res) {
  const token = await authSessions.create();
  res.setHeader("Set-Cookie", `bd_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
}

function validAccountInput(username, password) {
  return typeof username === "string" && username.trim().length >= 2 && username.trim().length <= 64 && !/[\r\n]/.test(username)
    && typeof password === "string" && password.length >= 12 && password.length <= 256 && !/[\r\n]/.test(password);
}

app.get("/auth/status", (req, res) => res.json({ required: AUTH_REQUIRED, configured: Boolean(authConfig), authenticated: authenticated(req), username: authenticated(req) ? authConfig?.username || "" : "" }));
app.post("/auth/setup", async (req, res) => {
  if (!AUTH_REQUIRED) return res.status(400).json({ error: "Die Anmeldung ist für diese Instanz nicht aktiviert." });
  if (authConfig || creatingAuth) return res.status(409).json({ error: "Das Benutzerkonto wurde bereits eingerichtet." });
  const username = req.body?.username?.trim();
  const password = req.body?.password;
  if (!validAccountInput(username, password)) return res.status(400).json({ error: "Benutzername: 2–64 Zeichen. Passwort: mindestens 12 Zeichen." });
  creatingAuth = true;
  try {
    const salt = randomBytes(16);
    const hash = await scryptAsync(password, salt, 64);
    const next = { username, salt: salt.toString("base64"), hash: hash.toString("base64") };
    await fs.writeFile(`${AUTH_FILE}.tmp`, JSON.stringify(next), { mode: 0o600 });
    await fs.rename(`${AUTH_FILE}.tmp`, AUTH_FILE);
    authConfig = next;
    await createSession(res);
    res.json({ authenticated: true, username });
  } catch {
    res.status(500).json({ error: "Das Benutzerkonto konnte nicht gespeichert werden." });
  } finally {
    creatingAuth = false;
  }
});
app.post("/auth/login", async (req, res) => {
  if (!AUTH_REQUIRED || !authConfig) return res.status(400).json({ error: "Das Benutzerkonto ist noch nicht eingerichtet." });
  const attemptKey = req.ip || "unknown";
  const attempt = loginAttempts.get(attemptKey) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (attempt.resetAt <= Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
  if (attempt.count >= 10) return res.status(429).json({ error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." });
  const username = req.body?.username?.trim() || "";
  const suppliedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const password = suppliedPassword.length <= 256 && !/[\r\n]/.test(suppliedPassword) ? suppliedPassword : "";
  const actual = await scryptAsync(password, Buffer.from(authConfig.salt, "base64"), 64);
  const expected = Buffer.from(authConfig.hash, "base64");
  const matches = username === authConfig.username && actual.length === expected.length && timingSafeEqual(actual, expected);
  if (!matches) {
    attempt.count += 1; loginAttempts.set(attemptKey, attempt);
    return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
  }
  loginAttempts.delete(attemptKey);
  try {
    await createSession(res);
    res.json({ authenticated: true, username });
  } catch {
    res.status(500).json({ error: "Die Anmeldung konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen." });
  }
});
app.post("/auth/logout", async (req, res) => {
  try {
    await authSessions.revoke(sessionToken(req));
    res.setHeader("Set-Cookie", "bd_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    res.json({ authenticated: false });
  } catch {
    res.status(500).json({ error: "Die Abmeldung konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen." });
  }
});
app.use((req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: "Bitte zuerst anmelden." }));

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = "https://api.bitpanda.com/v1";
const PUBLIC_BASE_URL = "https://api.public.bitpanda.com/v1";
const TICKER_URL = "https://developer.bitpanda.com/v1/ticker";
const PRICE_CACHE_MS = 60 * 1000;
const DASHBOARD_CACHE_MS = 5 * 60 * 1000;
const BACKGROUND_REFRESH_MS = 60 * 1000;
const DASHBOARD_CALCULATION_VERSION = 22;
const SNAPSHOT_MIN_INTERVAL_MS = 55 * 1000;
const DEFAULT_TRADE_FEE_EUR = 1;
const FIXED_TRADE_FEE_START_UNIX = Date.parse("2026-01-29T00:00:00+01:00") / 1000;
let CACHE_DIR = path.join(accountDir(), ".cache");
let DASHBOARD_CACHE_FILE = path.join(CACHE_DIR, "dashboard-data.json");
let CASHFLOW_OVERRIDES_FILE = path.join(accountDir(), "cashflow-overrides.json");
const tickerCache = new Map();
const MARKET_CACHE_MS = 3 * 60 * 1000;
const NEWS_CACHE_MS = 10 * 60 * 1000;
const marketCache = new Map();
const newsCache = new Map();
const exchangeRateCache = new Map();
const analystCache = new Map();
let publicEurCurrencyCache = null;
const publicTickerCache = new Map();
let publicAssetCatalogCache = null;
const ANALYST_SYMBOL_ALIASES = { FB: "META", "O-US": "O", "AMD-US": "AMD", "EPR-US": "EPR", RDSA: "SHEL" };

const MARKET_UNIVERSE = [
  ["AAPL", "Apple", "stock"], ["MSFT", "Microsoft", "stock"], ["MCD", "McDonald's", "stock"], ["META", "Meta", "stock"],
  ["NVDA", "NVIDIA", "stock"], ["AMZN", "Amazon", "stock"], ["GOOGL", "Alphabet", "stock"],
  ["TSLA", "Tesla", "stock"], ["AMD", "AMD", "stock"], ["SPY", "S&P 500 ETF", "etf"],
  ["SPYY", "MSCI ACWI (Acc)", "etf"], ["QQQ", "Nasdaq-100 ETF", "etf"],
  ["BTC", "Bitcoin", "crypto"], ["ETH", "Ethereum", "crypto"], ["SOL", "Solana", "crypto"]
].map(([symbol, name, category]) => ({ symbol, name, category }));

let savingSettings = false;
let dashboardRefreshPromise = null;
let settingsRevision = 0;
const dashboardEvents = createDashboardEvents();
app.get("/dashboard-events", (req, res) => {
  const revision = settingsRevision;
  dashboardEvents.attach(req, res, () => revision === settingsRevision && authenticated(req));
});
function settingsStatus() { return { bitpandaConfigured: Boolean(apiKey), finnhubConfigured: Boolean(finnhubApiKey), fusionConfigured: Boolean(fusionApiKey), credentialsStorage: PERSIST_CREDENTIALS ? "disk" : "memory", authRequired: AUTH_REQUIRED }; }
app.get("/settings", (req, res) => res.json(settingsStatus()));
app.put("/settings", async (req, res) => {
  if (!req.is("application/json")) return res.sendStatus(415);
  if (savingSettings) return res.status(409).json({ error: "Einstellungen werden bereits gespeichert. Bitte kurz warten." });
  for (const key of ["bitpanda", "finnhub", "fusion"]) {
    if (req.body[key] !== undefined && (typeof req.body[key] !== "string" || req.body[key].length > 512 || /[\r\n]/.test(req.body[key]))) return res.status(400).json({ error: "Ungültiger API-Key." });
  }
  savingSettings = true;
  try {
    const next = { bitpanda: req.body.bitpanda === undefined ? apiKey : req.body.bitpanda.trim(), finnhub: req.body.finnhub === undefined ? finnhubApiKey : req.body.finnhub.trim(), fusion: req.body.fusion === undefined ? fusionApiKey : req.body.fusion.trim() };
    if (PERSIST_CREDENTIALS) {
      await fs.writeFile(`${CREDENTIALS_FILE}.tmp`, JSON.stringify(next), { mode: 0o600 });
      await fs.rename(`${CREDENTIALS_FILE}.tmp`, CREDENTIALS_FILE);
    }
    apiKey = next.bitpanda; finnhubApiKey = next.finnhub; fusionApiKey = next.fusion;
    settingsRevision += 1;
    accountAssetCatalog.clear();
    historyReadCache.clear();
    dashboardEvents.clear();
    portfolioHistoryLoader.clear();
    dashboardRefreshPromise = null;
    CACHE_DIR = path.join(accountDir(), ".cache");
    DASHBOARD_CACHE_FILE = path.join(CACHE_DIR, "dashboard-data.json");
    CASHFLOW_OVERRIDES_FILE = path.join(accountDir(), "cashflow-overrides.json");
    analystCache.clear();
    res.json(settingsStatus());
  } catch { res.status(500).json({ error: "Die Zugangsdaten konnten nicht gespeichert werden." }); }
  finally { savingSettings = false; }
});
const chatgpt = await createChatGPT({ directory: DATA_DIR, callbackPort: Number(process.env.CHATGPT_CALLBACK_PORT || 1455), callbackHost: process.env.CHATGPT_CALLBACK_HOST || "127.0.0.1" });
const aiRoute = handler => async (req, res) => { try { await handler(req, res); } catch (error) { res.status(400).json({ error: error.message || "ChatGPT-Anfrage fehlgeschlagen." }); } };
app.get("/chatgpt/status", (req, res) => res.json(chatgpt.status()));
app.post("/chatgpt/connect", aiRoute(async (req, res) => res.json(await chatgpt.start(req.body?.account))));
app.post("/chatgpt/cancel", (req, res) => { chatgpt.cancel(); res.json({ ok: true }); });
app.post("/chatgpt/select", aiRoute(async (req, res) => { await chatgpt.select(req.body?.account); res.json(chatgpt.status()); }));
app.post("/chatgpt/disconnect", aiRoute(async (req, res) => res.json(await chatgpt.disconnect())));
app.get("/chatgpt/models", aiRoute(async (req, res) => res.json({ models: await chatgpt.models() })));
app.post("/chatgpt/analysis", aiRoute(async (req, res) => {
  const { symbol, category, name, horizon, risk, question = "", model, reasoningEffort = "default" } = req.body || {};
  if (typeof symbol !== "string" || symbol.length > 60 || !symbol.trim() || typeof name !== "string" || name.length > 160 || !["stock", "etf", "crypto", "metal", "other"].includes(category) || !ANALYSIS_HORIZONS.includes(horizon) || !["Niedrig", "Mittel", "Hoch"].includes(risk) || typeof question !== "string" || question.length > 2000) return res.status(400).json({ error: "Bitte gültige Analysevorgaben auswählen." });
  if (!chatgpt.status().eligible) return res.status(403).json({ error: "Bitte zuerst in den Einstellungen ein berechtigtes ChatGPT-Konto verbinden." });
  const [asset, news, analyst] = await Promise.all([
    fetchWatchlistQuote({ symbol: normalizeSymbol(symbol), category, name }),
    fetchMarketNews(`${name} ${symbol}`, 8).catch(() => []),
    fetchAnalystConsensus(normalizeSymbol(symbol), category).catch(() => ({ available: false }))
  ]);
  // Explicit allowlist: never send holdings, transactions, balances or credentials.
  const context = { asset: { symbol, name, category, price: asset.price, currency: asset.currency, source: asset.source, updatedAt: asset.updatedAt, sourceUpdatedAt: asset.sourceUpdatedAt, changePercent: asset.changePercent, history: asset.history?.map(p => ({ date: p.date, close: p.close })) }, analyst: alignAnalystCurrency(analyst, asset), news: news.map(n => ({ title: n.title, url: n.url || n.link, publishedAt: n.publishedAt, source: n.source })), retrievedAt: new Date().toISOString() };
  res.json(await chatgpt.analyze(model, analysisPrompt(context, horizon, risk, question), reasoningEffort));
}));
app.use((req, res, next) => {
  if (savingSettings) return res.status(503).json({ error: "Einstellungen werden gespeichert." });
  if (!apiKey && !req.path.startsWith("/market/")) return res.status(401).json({ error: "Bitte zuerst den Bitpanda API-Key in den Einstellungen hinterlegen." });
  next();
});

function uniqueById(items) {
  const map = new Map();

  for (const item of items) {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

const sharedRead = createReadDeduplicator();
const historyReadCache = createHistoryReadCache();
function fetchPaginated(endpoint, params = {}) {
  const key = JSON.stringify([settingsRevision, 'legacy', endpoint, Object.entries(params).sort()]);
  return sharedRead(key, () => fetchPaginatedUnshared(endpoint, params));
}
async function fetchPaginatedUnshared(endpoint, params = {}) {
  const pageSize = 100;
  let cursor = "";
  const allItems = [];
  const seenCursors = new Set();
  const historyKey = params.status !== 'pending' ? JSON.stringify([settingsRevision, endpoint, Object.entries(params).sort()]) : null;
  let firstSignature;

  while (true) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set("page_size", String(pageSize));

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bitpanda API Fehler: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const items = data.data || [];
    if (cursor === "" && historyKey) {
      const check = historyReadCache.inspect(historyKey, data);
      if (check.hit) return check.value;
      firstSignature = check.signature;
    }

    allItems.push(...items);

    const nextCursor =
      data.meta?.next_cursor ||
      data.links?.next?.match(/cursor=([^&]+)/)?.[1] ||
      data.links?.next?.match(/next_cursor=([^&]+)/)?.[1];

    if (!nextCursor || items.length === 0) {
      break;
    }

    cursor = decodeURIComponent(nextCursor);
    if (seenCursors.has(cursor)) throw new Error("Bitpanda wiederholt eine Historienseite; Abruf abgebrochen.");
    seenCursors.add(cursor);
  }

  const value = uniqueById(allItems);
  if (historyKey) historyReadCache.store(historyKey, firstSignature, value);
  return value;
}

function publicApiRequest(endpoint, options = {}) {
  if (options.method && options.method !== 'GET') return publicApiRequestUnshared(endpoint, options);
  const key = JSON.stringify([settingsRevision, 'public', endpoint, Object.entries(options.params || {}).sort(), options.timeoutMs]);
  return sharedRead(key, () => publicApiRequestUnshared(endpoint, options));
}
async function publicApiRequestUnshared(endpoint, { method = "GET", params = {}, body, timeoutMs } = {}) {
  const url = new URL(`${PUBLIC_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    ...((timeoutMs || method === "GET") ? { signal: AbortSignal.timeout(timeoutMs || 15_000) } : {}),
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok) {
    const apiError = payload?.error;
    const detail = apiError?.message || apiError?.code || payload?.message || apiError || `HTTP ${response.status}`;
    const error = new Error(`Bitpanda Public API: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    error.status = response.status;
    error.code = apiError?.code || payload?.code || "";
    throw error;
  }
  return payload;
}

async function fusionRequest(endpoint, { method = "GET", params = {}, body } = {}) {
  return requestFusion(endpoint, { apiKey: fusionApiKey, method, params, body });
}

function fusionPair(value) {
  const pair = String(value || "").toUpperCase();
  if (!/^[A-Z0-9]{2,15}-[A-Z0-9]{2,10}$/.test(pair)) throw new Error("Ungültiges Fusion-Handelspaar.");
  return pair;
}

async function fetchPublicPaginated(endpoint, params = {}, maxItems = 500) {
  if (endpoint !== "/operations" || maxItems !== Number.POSITIVE_INFINITY) return fetchPublicPages(publicApiRequest, endpoint, params, maxItems);
  const key = JSON.stringify([settingsRevision, 'public', endpoint, Object.entries(params).sort()]);
  const firstPage = await publicApiRequest(endpoint, { params: { ...params, page_size: 100, cursor: "" } });
  const check = historyReadCache.inspect(key, firstPage);
  if (check.hit) return check.value;
  const value = await fetchPublicPages(publicApiRequest, endpoint, params, maxItems, { firstPage });
  historyReadCache.store(key, check.signature, value);
  return value;
}

async function getPublicEurCurrencyId() {
  if (publicEurCurrencyCache) return publicEurCurrencyCache;
  const payload = await publicApiRequest("/currencies");
  const euro = (payload?.data || []).find(item => String(item.symbol).toUpperCase() === "EUR");
  if (!euro?.id) throw new Error("EUR wurde im Bitpanda-Währungskatalog nicht gefunden.");
  publicEurCurrencyCache = euro.id;
  return euro.id;
}

const accountAssetCatalog = createAccountAssetCatalog(async id => {
  const payload = await publicApiRequest("/assets", { params: { id } });
  const rows = payload?.data;
  if (!Array.isArray(rows) || rows.some(row => row.id !== id)) throw new Error("Bitpanda liefert unpassende Asset-Stammdaten.");
  return rows[0] || null;
});

async function loadPublicAssetCatalog() {
  if (publicAssetCatalogCache && Date.now() - publicAssetCatalogCache.loadedAt < 60 * 60 * 1000) return publicAssetCatalogCache.items;
  const items = await fetchPublicPaginated("/assets", {}, Number.POSITIVE_INFINITY);
  publicAssetCatalogCache = { items, loadedAt: Date.now() };
  return items;
}

function publicAssetCategory(item = {}) {
  return catalogCategory(item);
}

function cleanDecimal(value, field, { allowZero = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(raw)) throw new Error(`${field} muss eine positive Zahl sein.`);
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) throw new Error(`${field} muss größer als 0 sein.`);
  return raw;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

async function fetchTickerPage(params = {}) {
  const url = new URL(TICKER_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bitpanda Ticker Fehler: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function fetchTickerPrices(symbols) {
  const uniqueSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  const now = Date.now();
  const prices = new Map();
  const missingSymbols = [];

  for (const symbol of uniqueSymbols) {
    const cached = tickerCache.get(symbol);

    if (cached && now - cached.loadedAt < PRICE_CACHE_MS) {
      prices.set(symbol, cached.item);
    } else {
      missingSymbols.push(symbol);
    }
  }

  for (const symbolChunk of chunkArray(missingSymbols, 50)) {
    let cursor = "";

    while (true) {
      const data = await fetchTickerPage({
        symbol: symbolChunk.join(","),
        page_size: 500,
        cursor
      });

      for (const item of data.data || []) {
        const symbol = normalizeSymbol(item.symbol);
        if (!symbol) continue;

        tickerCache.set(symbol, {
          loadedAt: now,
          item
        });
        prices.set(symbol, item);
      }

      if (!data.has_next_page || !data.next_cursor) {
        break;
      }

      cursor = data.next_cursor;
    }
  }

  return prices;
}

function marketSymbol(symbol, category, name = "") {
  return resolveMarketSymbol(symbol, category, name);
}

function marketCategory(symbol, fallback = "other") {
  const normalized = normalizeSymbol(symbol);
  return MARKET_UNIVERSE.find(item => item.symbol === normalized)?.category || fallback;
}

function marketName(symbol, fallback = "") {
  const normalized = normalizeSymbol(symbol);
  return MARKET_UNIVERSE.find(item => item.symbol === normalized)?.name || fallback || normalized;
}

function analystSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  return ANALYST_SYMBOL_ALIASES[normalized] || normalized.replace(/-US$/, "");
}

async function fetchAnalystConsensus(symbol, category) {
  if (category !== "stock") return { available: false, message: "Für ETFs und Kryptowährungen liegen in dieser Quelle keine einheitlichen Analystenratings vor." };
  if (!finnhubApiKey) return { available: false, message: "Analystenkonsens ist optional. Hinterlege den Finnhub-Key in den Einstellungen, um echte Konsensdaten zu laden." };
  const ticker = analystSymbol(symbol);
  const cached = analystCache.get(ticker);
  if (cached && Date.now() - cached.loadedAt < 60 * 60 * 1000) return cached.value;
  const params = new URLSearchParams({ symbol: ticker, token: finnhubApiKey });
  const response = await fetch(`https://finnhub.io/api/v1/stock/recommendation?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Finnhub-Empfehlungen sind derzeit nicht verfügbar (HTTP ${response.status}). Prüfe API-Key oder Rate-Limit.`);
  const recommendations = await response.json();
  const latest = Array.isArray(recommendations) ? recommendations[0] : null;
  const total = [latest?.strongBuy, latest?.buy, latest?.hold, latest?.sell, latest?.strongSell].reduce((sum, value) => sum + Number(value || 0), 0);
  const value = total ? {
    available: true,
    symbol: ticker,
    period: latest?.period || null,
    consensus: { strongBuy: Number(latest?.strongBuy || 0), buy: Number(latest?.buy || 0), hold: Number(latest?.hold || 0), sell: Number(latest?.sell || 0), strongSell: Number(latest?.strongSell || 0), total },
    source: "Finnhub · Empfehlungstrends",
    updatedAt: new Date().toISOString()
  } : { available: false, message: "Für dieses Symbol liegen derzeit keine Analystendaten vor." };
  analystCache.set(ticker, { loadedAt: Date.now(), value });
  return value;
}

function alignAnalystCurrency(analyst, asset) {
  return analyst;
}

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function rssValue(item, tag) {
  return decodeXml(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "").trim();
}

function classifyNewsImpact(title = "") {
  const text = String(title).toLowerCase();
  const positiveTerms = ["steigt", "rally", "gewinnt", "gewinn", "rekord", "erhöht", "übertrifft", "wachstum", "zuwachs", "kaufen", "buy", "bull", "euphor", "positiv", "stark"];
  const negativeTerms = ["fällt", "verlust", "rückgang", "einbruch", "crash", "warnt", "warnung", "senkt", "sell", "verkaufen", "schwach", "druck", "risiko", "negativ", "klage", "strafe"];
  const positive = positiveTerms.filter(term => text.includes(term)).length;
  const negative = negativeTerms.filter(term => text.includes(term)).length;
  if (positive > negative) return { impact: "positive", impactLabel: "Eher positiv" };
  if (negative > positive) return { impact: "negative", impactLabel: "Eher negativ" };
  return { impact: "neutral", impactLabel: "Neutral" };
}

async function fetchEurExchangeRate(currency) {
  const sourceCurrency = String(currency || "EUR").toUpperCase();
  if (sourceCurrency === "EUR") return 1;
  const cached = exchangeRateCache.get(sourceCurrency);
  if (cached && Date.now() - cached.loadedAt < 60 * 60 * 1000) return cached.rate;
  const url = new URL("https://api.frankfurter.app/latest");
  url.searchParams.set("from", sourceCurrency);
  url.searchParams.set("to", "EUR");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wechselkurs ${sourceCurrency}/EUR nicht verfügbar.`);
  const payload = await response.json();
  const rate = Number(payload?.rates?.EUR || 0);
  if (!rate) throw new Error(`Ungültiger Wechselkurs ${sourceCurrency}/EUR.`);
  exchangeRateCache.set(sourceCurrency, { loadedAt: Date.now(), rate });
  return rate;
}

async function fetchMarketAsset(symbol, category = "other", name = "") {
  const normalized = normalizeSymbol(symbol);
  const yahooSymbol = marketSymbol(normalized, category, name);
  const cacheKey = `${normalized}:${category}:${yahooSymbol}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < MARKET_CACHE_MS) return cached.value;

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set("range", "1mo");
  url.searchParams.set("interval", "1d");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Marktdaten für ${normalized} sind derzeit nicht verfügbar.`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(value => Number.isFinite(Number(value))).map(Number);
  const timestamps = result?.timestamp || [];
  if (!closes.length) throw new Error(`Keine Kursdaten für ${normalized} gefunden.`);

  const sourcePrice = closes.at(-1);
  const previous = closes.length > 1 ? closes.at(-2) : null;
  const changePercent = previous ? (sourcePrice - previous) / previous * 100 : null;
  const sourceCurrency = String(result?.meta?.currency || "EUR").toUpperCase();
  let currency = sourceCurrency;
  let price = sourcePrice;
  let exchangeRate = null;
  if (sourceCurrency !== "EUR") {
    exchangeRate = await fetchEurExchangeRate(sourceCurrency);
    price = sourcePrice * exchangeRate;
    currency = "EUR";
  }
  let history = closes.slice(-20).map((close, index) => ({
    date: timestamps[Math.max(0, timestamps.length - closes.length + index)]
      ? new Date(timestamps[Math.max(0, timestamps.length - closes.length + index)] * 1000).toISOString()
      : null,
    close: close * (exchangeRate || 1)
  }));
  history = normalizeMarketUnit(history, normalized);
  price = normalizeMarketUnit([{ close: price }], normalized)[0].close;
  const unit = normalized === "XAU" ? "g" : null;
  const value = {
    symbol: normalized,
    name: result?.meta?.longName || result?.meta?.shortName || marketName(normalized, name),
    category: marketCategory(normalized, category),
    price,
    currency,
    unit,
    sourceCurrency,
    sourcePrice,
    exchangeRate,
    changePercent,
    volatility: closes.length > 5
      ? Math.sqrt(closes.slice(-10).reduce((sum, close, index, array) => {
        if (!index || !array[index - 1]) return sum;
        return sum + Math.pow((close - array[index - 1]) / array[index - 1], 2);
      }, 0) / Math.max(1, closes.length - 1)) * 100
      : null,
    history,
    source: exchangeRate ? `Yahoo Finance · ${sourceCurrency}→EUR (Frankfurter/ECB)` : "Yahoo Finance",
    sourceUpdatedAt: history.at(-1)?.date || null,
    updatedAt: new Date().toISOString()
  };
  marketCache.set(cacheKey, { loadedAt: Date.now(), value });
  return value;
}

async function fetchBitpandaWatchlistQuote(entry = {}) {
  const symbol = normalizeSymbol(entry.symbol);
  try {
    const tickers = await fetchTickerPrices([symbol]);
    const ticker = tickers.get(symbol);
    if (!ticker) throw new Error(`Kein Bitpanda-Kurs für ${symbol} verfügbar.`);
    return {
      symbol,
      name: getAssetDisplayName(symbol, ticker) || entry.name || symbol,
      category: marketCategory(symbol, entry.category),
      price: Number(ticker.price || 0),
      currency: ticker.currency || "EUR",
      unit: symbol === "XAU" ? "g" : null,
      changePercent: ticker.price_change_day == null ? null : Number(ticker.price_change_day),
      volatility: null,
      history: [],
      source: "Bitpanda Price Ticker",
      sourceUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fallback: true
    };
  } catch (error) {
    throw error;
  }
}

async function fetchWatchlistQuote(entry = {}) {
  // Portfolio positions are valued with the same EUR ticker used everywhere
  // else in this dashboard. External watchlist symbols use Yahoo Finance.
  if (entry.isPortfolio) {
    try { return await fetchBitpandaWatchlistQuote(entry); } catch { /* fall through */ }
  }
  try {
    return await fetchMarketAsset(entry.symbol, entry.category, entry.name);
  } catch (marketError) {
    try { return await fetchBitpandaWatchlistQuote(entry); } catch { throw marketError; }
  }
}

async function fetchMarketNews(query, limit = 8) {
  const cleanQuery = String(query || "Aktien OR Kryptowährungen").trim().slice(0, 120);
  const cacheKey = `${cleanQuery}:${limit}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < NEWS_CACHE_MS) return cached.value;
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("hl", "de");
  url.searchParams.set("gl", "AT");
  url.searchParams.set("ceid", "AT:de");
  const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml" } });
  if (!response.ok) throw new Error("Aktuelle Nachrichten sind derzeit nicht verfügbar.");
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    const rawTitle = rssValue(item, "title");
    const source = rssValue(item, "source") || rawTitle.split(" - ").at(-1) || "Nachrichtenquelle";
    return {
      title: rawTitle.replace(new RegExp(`\\s-\\s${source.replace(/[.*+?^${}()|[\]\\\\]/g, "\\$&")}$`), ""),
      source,
      url: rssValue(item, "link"),
      publishedAt: rssValue(item, "pubDate") || null,
      category: "market",
      ...classifyNewsImpact(rawTitle)
    };
  }).filter(item => item.title && item.url)
    .sort((a, b) => {
      const aTime = Date.parse(a.publishedAt || "") || 0;
      const bTime = Date.parse(b.publishedAt || "") || 0;
      return bTime - aTime;
    })
    .slice(0, limit);
  newsCache.set(cacheKey, { loadedAt: Date.now(), value: items });
  return items;
}

function createMarketAnalysis(asset, news = [], analyst = null) {
  const day = Number(asset.changePercent || 0);
  const firstClose = Number(asset.history?.[0]?.close || 0);
  const monthChange = firstClose > 0 ? (Number(asset.price || 0) - firstClose) / firstClose * 100 : null;
  const volatile = Number(asset.volatility || 0) >= 4;
  const score = (day > 1 ? 1 : day < -1 ? -1 : 0) + (monthChange > 2 ? 1 : monthChange < -2 ? -1 : 0) - (volatile ? 1 : 0);
  const tendency = score > 0 ? "positiv" : score < 0 ? "negativ" : "neutral";
  const marketMood = tendency;
  const assetRisk = asset.category === "crypto"
    ? "Kryptomärkte reagieren häufig besonders stark auf Marktstimmung und Regulierung."
    : asset.category === "etf"
      ? "Der ETF hängt von der Entwicklung seiner enthaltenen Märkte und Währungen ab."
      : "Unternehmensnachrichten, Quartalszahlen und die allgemeine Börsenstimmung können den Kurs beeinflussen.";
  const monthsOutlook = tendency === "positiv"
    ? "Für die nächsten Monate ist die Einordnung vorsichtig positiv, sofern sich der Kurs- und Nachrichtentrend nicht dreht."
    : tendency === "negativ"
      ? "Für die nächsten Monate ist die Einordnung vorsichtig negativ; eine Stabilisierung müsste sich zuerst in den Kursdaten zeigen."
      : "Für die nächsten Monate ist die Einordnung neutral, weil die vorliegenden Kursdaten keine klare Richtung ergeben.";
  const yearsOutlook = analyst?.available && analyst.targets?.mean
    ? "Für mehrere Jahre ist keine belastbare KI-Prognose möglich. Der Analystenkonsens unten ist ein zusätzlicher, aber ebenfalls unsicherer Datenpunkt."
    : "Für mehrere Jahre ist aus kurzfristigen Kursdaten keine seriöse Prognose ableitbar. Fundamentaldaten und künftige Entwicklungen können die Lage deutlich verändern.";
  const dayReason = `Tagesbewegung: ${day.toFixed(2)} %.`;
  const trendReason = monthChange == null
    ? "Für einen 20-Tage-Trend liegen keine ausreichend langen Kursdaten vor."
    : `20-Tage-Trend: ${monthChange.toFixed(2)} %.`;
  const volatilityReason = volatile
    ? `Die kurzfristige Volatilität ist mit ${Number(asset.volatility).toFixed(2)} % erhöht und dämpft die Sicherheit der Tendenz.`
    : "Die gemessene kurzfristige Volatilität ist nicht auffällig erhöht.";
  const directionText = tendency === "positiv"
    ? "Die Datenlage ist derzeit eher positiv."
    : tendency === "negativ"
      ? "Die Datenlage ist derzeit eher negativ."
      : "Die Datenlage ist derzeit neutral und liefert keine klare Richtung.";
  return {
    tendency,
    marketMood,
    reasons: [dayReason, trendReason, volatilityReason, news.length ? `${news.length} aktuelle, zum Asset gefundene Nachrichten sind verlinkt.` : "Derzeit wurden keine aktuellen, zum Asset passenden Nachrichten gefunden."],
    outlook: { months: monthsOutlook, years: yearsOutlook },
    summary: `${directionText} ${dayReason} ${trendReason} Diese Einschätzung ist keine Vorhersage oder Anlageberatung.`,
    opportunities: [tendency === "positiv" ? "Der kombinierte Tages- und 20-Tage-Trend stützt derzeit die positive Einordnung." : "Eine Verbesserung des Tages- und 20-Tage-Trends könnte die Einordnung aufhellen.", news.length ? "Die verlinkten aktuellen Nachrichten können für die weitere Entwicklung relevante Auslöser enthalten." : "Ohne aktuelle Nachrichten ist die Einordnung stärker von der Kursentwicklung abhängig."],
    risks: [volatilityReason, assetRisk],
    scenarios: [
      { label: "Positiv", tone: "positive", text: `Wahrscheinlicher, wenn sich der aktuelle ${monthChange == null ? "Kursimpuls" : `20-Tage-Trend von ${monthChange.toFixed(2)} %`} fortsetzt und die nächsten Nachrichten keine Belastung liefern.` },
      { label: "Neutral", tone: "neutral", text: `Plausibel, wenn sich die Tagesbewegungen um den aktuellen Kurs stabilisieren und weder neue positive noch negative Auslöser überwiegen.` },
      { label: "Negativ", tone: "negative", text: `Das Risiko besteht bei einem weiteren Rückgang unter den aktuellen Tagestrend${volatile ? "; die erhöhte Volatilität könnte Bewegungen verstärken." : "."}` }
    ]
  };
}

function enrichOpenPositionsWithPrices(openPositions, tickerPrices) {
  return openPositions.map(position => {
    const symbol = normalizeSymbol(position.underlyingSymbol || position.assetKey || position.name);
    const candidate = tickerPrices.get(symbol);
    const category = position.metadataCategory || getTickerCategory(symbol, candidate);
    const ticker = candidate?.accountAssetId || (candidate && catalogCategory(candidate) === category) ? candidate : null;
    return {
      ...position,
      priceSymbol: symbol,
      displayName: position.metadataCategory ? position.displayName : getAssetDisplayName(symbol, ticker && getTickerCategory(symbol, ticker) === catalogCategory(ticker) ? ticker : null),
      category,
      categoryLabel: ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other,
      tickerType: ticker?.type || null,
      ...valueOpenPosition(position, ticker),
      priceChangeDay: ticker?.accountAssetId ? null : ticker?.price_change_day == null ? null : Number(ticker.price_change_day),
    };
  });
}

function normalizeLeveragePosition(item) {
  const attributes = item?.attributes || item || {};
  const symbol = normalizeSymbol(
    attributes.asset_symbol ||
    attributes.underlying_asset_symbol ||
    attributes.cryptocoin_symbol ||
    attributes.instrument_symbol ||
    attributes.symbol ||
    attributes.instrument?.symbol
  );
  const quantity = Math.abs(Number(
    attributes.quantity || attributes.amount || attributes.size || attributes.position_size || 0
  ));
  const leverage = Number(attributes.leverage || attributes.multiplier || attributes.leverage_multiplier || 0);
  const entryPrice = Number(attributes.entry_price || attributes.open_price || attributes.average_open_price || 0);

  if (!symbol || !Number.isFinite(quantity) || quantity <= 0) return null;

  return ensureAssetMetadata({
    assetKey: `LEVERAGE:${symbol}:${item?.id || attributes.id || symbol}`,
    underlyingSymbol: symbol,
    name: symbol,
    displayName: getAssetDisplayName(symbol),
    currentQuantity: quantity,
    costBasis: entryPrice > 0 ? quantity * entryPrice : 0,
    averageRemainingCost: entryPrice || 0,
    positionType: "leverage",
    positionSource: "Bitpanda Leverage",
    leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : null,
    direction: String(attributes.direction || attributes.side || attributes.position_side || "").toLowerCase() || null,
    openedAt: attributes.opened_at || attributes.created_at || attributes.time?.date_iso8601 || null,
    walletReconciled: false,
    trades: []
  });
}

async function fetchLeveragePositions() {
  // The endpoint is not available to every Bitpanda API key. A missing permission
  // simply means there are no leverage positions available to this dashboard.
  try {
    const response = await fetch(`${BASE_URL}/leverage/positions`, {
      signal: AbortSignal.timeout(15_000),
      headers: { "X-Api-Key": apiKey, Accept: "application/json" }
    });
    if (!response.ok) return Object.assign([], { status: { available: false, message: `Aktuelle Hebelpositionen sind über deinen API-Key derzeit nicht verfügbar. Historische Hebelbuchungen sind im Buchungsverlauf sichtbar.` } });
    const data = await response.json();
    return Object.assign((data.data || []).map(normalizeLeveragePosition).filter(Boolean), { status: { available: true } });
  } catch {
    return Object.assign([], { status: { available: false, message: "Aktuelle Hebelpositionen konnten nicht geladen werden. Historische Buchungen bleiben verfügbar." } });
  }
}

function summarizeOpenPositions(openPositions) {
  const positionsWithPrice = openPositions.filter(position => position.currentValue !== null);
  const marketValue = positionsWithPrice.reduce((sum, position) => sum + Number(position.currentValue || 0), 0);
  const pricedCostBasis = positionsWithPrice.reduce((sum, position) => sum + Number(position.costBasis || 0), 0);
  const unrealizedProfit = marketValue - pricedCostBasis;

  return {
    marketValue,
    pricedCostBasis,
    unrealizedProfit,
    unrealizedProfitPercent: pricedCostBasis > 0 ? unrealizedProfit / pricedCostBasis * 100 : null,
    pricedPositions: positionsWithPrice.length,
    unpricedPositions: openPositions.length - positionsWithPrice.length
  };
}

function summarizeLiquidBalance(fiatWallets = [], openPositions = [], walletBalances = new Map()) {
  const fiatItems = fiatWallets
    .filter(wallet => Number(wallet.balance || 0) > 0)
    .map(wallet => ({
      type: "fiat",
      symbol: wallet.symbol,
      name: wallet.name,
      value: Number(wallet.eurValue || 0),
      balance: Number(wallet.balance || 0)
    }));
  // Cash Plus is intentionally excluded from the trade/P&L calculation. Its
  // wallet balance is therefore the authoritative source for liquid cash.
  // Keeping a position fallback also supports older cached/manual positions.
  const cashPlusBySymbol = new Map();

  for (const [symbol, wallet] of walletBalances) {
    if (!CASH_PLUS_SYMBOLS.has(normalizeSymbol(symbol))) continue;

    const balance = Number(wallet?.balance || 0);
    if (!Number.isFinite(balance) || balance <= 0) continue;

    cashPlusBySymbol.set(normalizeSymbol(symbol), {
      type: "cash_plus",
      symbol: normalizeSymbol(symbol),
      name: wallet?.walletName || "Bitpanda Cash Plus",
      // BCPEUR is EUR-denominated, so its wallet quantity is its EUR value.
      value: balance,
      balance
    });
  }

  for (const position of openPositions) {
    const symbol = normalizeSymbol(position.assetKey || position.name);
    if (!CASH_PLUS_SYMBOLS.has(symbol) || cashPlusBySymbol.has(symbol)) continue;

    const balance = Number(position.currentQuantity || 0);
    if (!Number.isFinite(balance) || balance <= 0) continue;

    cashPlusBySymbol.set(symbol, {
      type: "cash_plus",
      symbol,
      name: position.displayName || position.name || "Bitpanda Cash Plus",
      value: balance,
      balance
    });
  }

  const cashPlusItems = Array.from(cashPlusBySymbol.values());
  const fiatValue = fiatItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const cashPlusValue = cashPlusItems.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return {
    totalValue: fiatValue + cashPlusValue,
    fiatValue,
    cashPlusValue,
    items: [...fiatItems, ...cashPlusItems]
  };
}

function isCashPlusPosition(positionOrSymbol) {
  const symbol = typeof positionOrSymbol === "string"
    ? positionOrSymbol
    : positionOrSymbol?.assetKey || positionOrSymbol?.name;

  return CASH_PLUS_SYMBOLS.has(normalizeSymbol(symbol));
}

async function readJsonFile(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(error);
    }
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await writeJsonAtomically(filePath, data);
}

const cashflowStores = new Map();
function cashflowStore() {
  const file = CASHFLOW_OVERRIDES_FILE;
  if (!cashflowStores.has(file)) cashflowStores.set(file, createCashflowStore({
    read: () => readJsonFile(file, { overrides: {} }),
    write: data => writeJsonFile(file, data)
  }));
  return cashflowStores.get(file);
}
async function readCashflowOverrides() { return cashflowStore().read(); }
async function writeCashflowOverrides(data) { return cashflowStore().update(data); }

function getFiatTotal(fiatPeriods = []) {
  return fiatPeriods.reduce((sum, period) => sum + Number(period.net || 0), 0);
}

function getDividendTotal(fiatPeriods = []) {
  return fiatPeriods.reduce((sum, period) => sum + Number(period.dividends || 0), 0);
}

function getRealizedProfitTotal(assets = []) {
  return assets.reduce((sum, asset) => sum + Number(asset.realizedProfit || 0), 0);
}

function createPortfolioSummary({ transactions, fiatPeriods, profitLoss, openPositions, priceSummary, liquidBalance }) {
  const realizedProfit = getRealizedProfitTotal(profitLoss.assets || []) - Number(profitLoss.unallocatedTaxAdjustment || 0);
  const fiatNet = getFiatTotal(fiatPeriods.yearly || []);
  const dividends = getDividendTotal(fiatPeriods.yearly || []);
  const investedValue = Number(priceSummary.marketValue || 0);
  const liquidValue = Number(liquidBalance?.totalValue || 0);
  const totalValue = investedValue + liquidValue;
  const unrealizedProfit = Number(priceSummary.unrealizedProfit || 0);
  const totalReturn = realizedProfit + unrealizedProfit + dividends;
  const netInvestedFiat = fiatNet;
  const accountReturn = totalValue - netInvestedFiat;
  const bestPosition = [...openPositions]
    .filter(position => position.unrealizedProfit !== null && position.unrealizedProfit !== undefined)
    .sort((a, b) => Number(b.unrealizedProfit || 0) - Number(a.unrealizedProfit || 0))[0] || null;
  const worstPosition = [...openPositions]
    .filter(position => position.unrealizedProfit !== null && position.unrealizedProfit !== undefined)
    .sort((a, b) => Number(a.unrealizedProfit || 0) - Number(b.unrealizedProfit || 0))[0] || null;

  return {
    totalValue,
    investedValue,
    openCostBasis: Number(priceSummary.pricedCostBasis || 0),
    unrealizedProfit,
    unrealizedProfitPercent: priceSummary.unrealizedProfitPercent,
    realizedProfit,
    accountReturn,
    accountReturnPercent: netInvestedFiat > 0 ? accountReturn / netInvestedFiat * 100 : null,
    totalReturn,
    totalReturnPercent: netInvestedFiat > 0 ? totalReturn / netInvestedFiat * 100 : null,
    totalInvested: netInvestedFiat,
    netInvestedFiat,
    fiatNet,
    dividends,
    liquidBalance,
    transactionCount: transactions.length,
    openPositionCount: openPositions.length,
    bestPosition,
    worstPosition
  };
}

function ensureAssetMetadata(asset) {
  if (!asset) return asset;

  const symbol = normalizeSymbol(asset.assetKey || asset.name);
  const category = asset.metadataCategory || getTickerCategory(symbol, asset.tickerType ? { type: asset.tickerType } : null);

  return {
    ...asset,
    displayName: asset.displayName || getAssetDisplayName(symbol),
    category,
    categoryLabel: ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other
  };
}

function ensureProfitLossMetadata(profitLoss) {
  if (!profitLoss) return profitLoss;

  const assets = (profitLoss.assets || []).map(ensureAssetMetadata);
  const assetsByKey = new Map(assets.map(asset => [String(asset.assetKey), asset]));
  const openPositions = (profitLoss.openPositions || []).map(position => ({
    ...ensureAssetMetadata(position),
    ...assetsByKey.get(String(position.assetKey))
  }));

  return {
    ...profitLoss,
    assets,
    openPositions,
    categorySummary: summarizeProfitLossByCategory(assets),
    top: rebuildProfitLossTopLists(assets)
  };
}

function ensureDashboardAssetMetadata(dashboardData) {
  if (!dashboardData) return dashboardData;

  const profitLoss = ensureProfitLossMetadata(dashboardData.profitLoss);
  const openPositions = (dashboardData.openPositions || []).map(position => {
    const fromProfitLoss = (profitLoss?.assets || []).find(asset => String(asset.assetKey) === String(position.assetKey));
    return {
      ...ensureAssetMetadata(position),
      ...fromProfitLoss,
      ...position
    };
  }).map(ensureAssetMetadata);

  return {
    ...dashboardData,
    profitLoss,
    paidTax: profitLoss.paidTax,
    openPositions,
    portfolio: dashboardData.portfolio
      ? {
        ...dashboardData.portfolio,
        openPositionCount: openPositions.length,
        bestPosition: ensureAssetMetadata(dashboardData.portfolio.bestPosition),
        worstPosition: ensureAssetMetadata(dashboardData.portfolio.worstPosition)
      }
      : dashboardData.portfolio
  };
}

function ensurePortfolioReturnFields(dashboardData) {
  dashboardData = ensureDashboardAssetMetadata(dashboardData);
  if (!dashboardData?.portfolio) return dashboardData;

  const { earnRewards, earnError, ...dashboardWithoutEarn } = dashboardData;
  dashboardData = dashboardWithoutEarn;
  dashboardData.openPositions = (dashboardData.openPositions || []).map(position => ({
    ...position,
    custodySource: position.custodySource === "Bitpanda Earn/Staking" ? "Bitpanda Custody" : position.custodySource
  }));
  if (dashboardData.portfolio?.bestPosition?.custodySource === "Bitpanda Earn/Staking") {
    dashboardData.portfolio.bestPosition.custodySource = "Bitpanda Custody";
  }
  if (dashboardData.portfolio?.worstPosition?.custodySource === "Bitpanda Earn/Staking") {
    dashboardData.portfolio.worstPosition.custodySource = "Bitpanda Custody";
  }

  const realizedProfit = Number(dashboardData.portfolio.realizedProfit || 0);
  const unrealizedProfit = Number(dashboardData.portfolio.unrealizedProfit || 0);
  const dividends = Number(dashboardData.portfolio.dividends || 0);
  const netInvestedFiat = Number(dashboardData.portfolio.fiatNet || 0);
  const totalReturn = realizedProfit + unrealizedProfit + dividends;
  const accountReturn = Number(dashboardData.portfolio.totalValue || 0) - netInvestedFiat;

  return {
    ...dashboardData,
    snapshots: excludeCorrectedSnapshots(dashboardData.snapshots || []),
    portfolioHistoryWarning: portfolioSnapshotIssue(dashboardData),
    portfolio: {
      ...dashboardData.portfolio,
      accountReturn,
      accountReturnPercent: netInvestedFiat > 0 ? accountReturn / netInvestedFiat * 100 : null,
      totalReturn,
      totalReturnPercent: netInvestedFiat > 0 ? totalReturn / netInvestedFiat * 100 : null,
      totalInvested: netInvestedFiat,
      netInvestedFiat
    }
  };
}

const portfolioHistoryLoader = createPortfolioHistoryLoader(async timeframe => {
  const revision = settingsRevision;
  const eurCurrencyId = await getPublicEurCurrencyId();
  if (revision !== settingsRevision) throw new Error("Konto wurde während des Abrufs geändert.");
  const payload = await publicApiRequest("/portfolio-history", { params: { timeframe, equivalent_currency_id: eurCurrencyId }, timeoutMs: 15_000 });
  if (revision !== settingsRevision) throw new Error("Konto wurde während des Abrufs geändert.");
  return normalizePortfolioHistory(payload, { timeframe, eurCurrencyId });
});

app.get("/portfolio-history", async (req, res) => {
  const range = req.query.range ?? "1d";
  const timeframe = typeof range === "string" && Object.hasOwn(PORTFOLIO_TIMEFRAMES, range) ? PORTFOLIO_TIMEFRAMES[range] : null;
  if (!timeframe) return res.status(400).json({ error: "Ungültiger Portfolio-Zeitraum." });
  const revision = settingsRevision;
  try {
    const result = await portfolioHistoryLoader.load(timeframe, { refresh: req.query.refresh === "1" });
    if (revision !== settingsRevision) return res.status(409).json({ error: "Konto wurde während des Abrufs geändert." });
    res.json(result);
  } catch { res.status(502).json({ error: "Bitpanda-Portfoliohistorie ist derzeit nicht verfügbar. Der gespeicherte Verlauf bleibt erhalten." }); }
});

function appendPortfolioSnapshot(cache, dashboardData) {
  const historyStartedAt = new Date(dashboardData.portfolioHistoryStartedAt).getTime();
  const snapshots = (Array.isArray(cache?.snapshots) ? cache.snapshots : [])
    .filter(snapshot => new Date(snapshot?.createdAt).getTime() >= historyStartedAt);
  if (portfolioSnapshotIssue(dashboardData)) return snapshots;
  // Retain independent account observations even when official history works.
  // Otherwise a single rolling daily point cannot verify historical API spikes.
  const latestSnapshot = snapshots[snapshots.length - 1];
  const now = Date.now();

  if (latestSnapshot && now - new Date(latestSnapshot.createdAt).getTime() < SNAPSHOT_MIN_INTERVAL_MS) {
    return snapshots;
  }

  return compactPortfolioSnapshots(excludeCorrectedSnapshots([
    ...snapshots,
    {
      createdAt: dashboardData.loadedAt,
      totalValue: dashboardData.portfolio.totalValue,
      openCostBasis: dashboardData.portfolio.openCostBasis,
      unrealizedProfit: dashboardData.portfolio.unrealizedProfit,
      openPositionCount: dashboardData.portfolio.openPositionCount
    }
  ]), now);
}

function compactPortfolioSnapshots(snapshots, now = Date.now()) {
  const recentLimit = now - 48 * 60 * 60 * 1000;
  const monthlyLimit = now - 31 * 24 * 60 * 60 * 1000;
  const buckets = new Map();

  for (const snapshot of snapshots) {
    const timestamp = new Date(snapshot?.createdAt).getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(Number(snapshot?.totalValue))) continue;

    let bucket;
    if (timestamp >= recentLimit) bucket = `minute:${Math.floor(timestamp / 60_000)}`;
    else if (timestamp >= monthlyLimit) bucket = `quarter-hour:${Math.floor(timestamp / (15 * 60_000))}`;
    else bucket = `day:${new Date(timestamp).toISOString().slice(0, 10)}`;
    buckets.set(bucket, snapshot);
  }

  return Array.from(buckets.values())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-20_000);
}

async function buildDashboardData(previousCache = null) {
  const transactionsRequest = fetchWantedFiatMovements();
  const custodyRequest = fetchCryptoWalletTransactions();
  const walletRequests = Promise.allSettled([
    fetchFiatWalletBalances(),
    Promise.all([fetchWalletBalances(), custodyRequest, fetchReservedCryptoTransactions()])
  ]);
  const apiHistoryRequest = portfolioHistoryLoader.load("DAY").catch(() => ({ available: false, warning: "Bitpanda-Portfoliohistorie ist derzeit nicht verfügbar." }));
  const [transactions, dividends, leveragePositions, profitLossResult, walletResults, portfolioApiHistory] = await Promise.all([
    transactionsRequest, fetchDividendMovements(), fetchLeveragePositions(),
    transactionsRequest.then(transactions => fetchProfitLoss(transactions, { includeAccountInputs: true, financingRequest: custodyRequest })),
    walletRequests, apiHistoryRequest
  ]);
  // Bitpanda flags recurring-plan deposits, but not always the buy that follows.
  // Pass those deposits along so the profit calculation can identify the matching buy.
  const { accountInputs, ...profitLoss } = profitLossResult;
  const fiatPeriods = calculateFiatPeriods(transactions, dividends);
  let fiatWallets = [];
  let openPositions = profitLoss.openPositions || [];
  let reconciliation = {
    source: "Trade-Historie",
    hiddenZeroBalancePositions: [],
    quantityMismatches: []
  };
  let custodyTransactions = [];
  let reservedTransactions = [];
  let walletBalances = new Map();
  let balanceError = null;
  let priceError = null;
  let liquidBalanceError = null;

  try {
    if (walletResults[0].status === "rejected") throw walletResults[0].reason;
    fiatWallets = walletResults[0].value;
  } catch (error) {
    liquidBalanceError = error.message;
    console.error(error);
  }

  try {
    if (walletResults[1].status === "rejected") throw walletResults[1].reason;
    const [loadedWalletBalances, loadedCustodyTransactions, loadedReservedTransactions] = walletResults[1].value;
    custodyTransactions = loadedCustodyTransactions;
    reservedTransactions = loadedReservedTransactions;
    walletBalances = loadedWalletBalances;
    const custodyBalances = calculateBitpandaCustodyBalances(custodyTransactions);
    const reconciled = reconcileOpenPositionsWithWallets(openPositions, walletBalances, custodyBalances);
    openPositions = reconciled.openPositions;
    reconciliation = reconciled.reconciliation;
  } catch (error) {
    balanceError = error.message;
    console.error(error);
  }


  let accountInsights = { available: false, error: "Zusätzliche Kontodaten konnten nicht aus der API geladen werden." };
  if (accountInputs) {
    try {
      accountInsights = buildAccountInsights(accountInputs.operations, { ...accountInputs, cryptoTransactions: custodyTransactions });
    } catch (error) {
      console.error(error);
      accountInsights.error = "Kontobuchungen konnten nicht vollständig ausgewertet werden.";
    }
  }
  if (accountInsights.portfolioAvailable) {
    openPositions = applyReportedPortfolio(openPositions, accountInsights.portfolio, profitLoss.assets).map(ensureAssetMetadata);
    reconciliation.source = "Bitpanda Portfolio API";
    if (accountInsights.portfolio.some(row => row.balance > 0 && !row.assetKey)) balanceError ||= "Asset-Stammdaten fehlen für einen aktuellen Bestand; Bewertung ist unvollständig.";
  } else {
    balanceError ||= "Aktueller Bitpanda-Portfolio-Bestand konnte nicht geladen werden.";
  }

  // Keep reservation details for account diagnostics. Reported total balances
  // already include reserved holdings; do not add them a second time.
  const reservedPositions = getReservedPositions([...custodyTransactions, ...reservedTransactions]);
  openPositions = [...openPositions, ...leveragePositions];

  let pricedOpenPositions = enrichOpenPositionsWithPrices(openPositions, new Map());

  const tickerResults = await Promise.allSettled([
    fetchTickerPrices(openPositions.map(position => position.underlyingSymbol || position.assetKey || position.name)),
    ...openPositions.filter(position => position.reportedAssetId).map(async position => {
      const payload = await publicApiRequest(`/tickers/${encodeURIComponent(position.reportedAssetId)}`);
      const item = accountAssetTicker(payload, position.reportedAssetId, accountInputs?.eurCurrencyId);
      return { symbol: position.assetKey, item };
    })
  ]);
  const tickerPrices = tickerResults[0].status === 'fulfilled' ? new Map(tickerResults[0].value) : new Map();
  const unavailablePrices = [];
  for (const result of tickerResults.slice(1)) {
    if (result.status === 'fulfilled' && result.value.item) {
      const { symbol, item } = result.value;
      tickerPrices.set(symbol, { ...tickerPrices.get(symbol), ...item });
    } else unavailablePrices.push(result.status === 'fulfilled' ? result.value.symbol : 'Asset-Ticker');
  }
  if (unavailablePrices.length) priceError = 'Einzelne Bitpanda-Stückkurse sind derzeit nicht verfügbar. Gemeldete Positionswerte bleiben erhalten.';
  pricedOpenPositions = enrichOpenPositionsWithPrices(openPositions, tickerPrices)
    .sort((a, b) => Number(b.currentValue ?? b.costBasis ?? 0) - Number(a.currentValue ?? a.costBasis ?? 0));

  const investedOpenPositions = pricedOpenPositions.filter(position => !isCashPlusPosition(position));
  const priceSummary = summarizeOpenPositions(investedOpenPositions);
  const liquidBalance = summarizeLiquidBalance(fiatWallets, pricedOpenPositions, walletBalances);
  const loadedAt = new Date().toISOString();
  const portfolio = createPortfolioSummary({
    transactions,
    fiatPeriods,
    profitLoss,
    openPositions: investedOpenPositions,
    priceSummary,
    liquidBalance
  });
  const dashboardData = {
    calculationVersion: DASHBOARD_CALCULATION_VERSION,
    loadedAt,
    historyFullyReadAt: historyReadCache.oldestFullReadAt(),
    portfolioHistoryStartedAt: previousCache?.portfolioHistoryStartedAt || loadedAt,
    cacheMaxAgeMs: DASHBOARD_CACHE_MS,
    transactions,
    dividends,
    fiat: fiatPeriods,
    profitLoss,
    paidTax: profitLoss.paidTax,
    openPositions: investedOpenPositions,
    warnings: profitLoss.warnings || [],
    priceSummary,
    reconciliation,
    balanceError,
    priceError,
    liquidBalanceError,
    portfolio,
    reservedPositions,
    leveragePositions,
    leverageStatus: leveragePositions.status || { available: true },
    accountInsights,
    fiatWallets,
    snapshots: []
  };
  dashboardData.portfolioApiHistory = portfolioApiHistory;
  dashboardData.portfolioHistoryWarning = portfolioSnapshotIssue(dashboardData);
  dashboardData.snapshots = appendPortfolioSnapshot(previousCache, dashboardData);

  return dashboardData;
}

async function getDashboardData({ forceRefresh = false, allowStale = false } = {}) {
  const cachedRaw = await readDashboardCache(DASHBOARD_CACHE_FILE);
  const cached = ensurePortfolioReturnFields(cachedRaw);
  if (cached) {
    const corrections = await readJsonFile(path.join(accountDir(), "portfolio-history-corrections.json"), []);
    cached.snapshots = excludeCorrectedSnapshots(cached.snapshots || [], corrections);
    cached.portfolioHistoryWarning = portfolioSnapshotIssue(cached);
  }
  const cachedAt = cached?.loadedAt ? new Date(cached.loadedAt).getTime() : 0;

  if (!forceRefresh && cached && cached.calculationVersion === DASHBOARD_CALCULATION_VERSION && Date.now() - cachedAt < (allowStale ? BACKGROUND_REFRESH_MS : DASHBOARD_CACHE_MS)) {
    return {
      ...cached,
      cache: {
        status: "hit",
        ageMs: Date.now() - cachedAt,
        maxAgeMs: DASHBOARD_CACHE_MS
      }
    };
  }

  if (!dashboardRefreshPromise) {
    const refreshRevision = settingsRevision;
    const refreshFile = DASHBOARD_CACHE_FILE;
    const runningRefresh = (async () => {
      const fresh = await buildDashboardData(cached);
      if (refreshRevision !== settingsRevision) throw new Error("Die Zugangsdaten wurden während der Aktualisierung geändert.");
      await writeDashboardCache(refreshFile, fresh, cachedRaw?.loadedAt);
      if (refreshRevision === settingsRevision) dashboardEvents.publish(fresh.loadedAt);
      return fresh;
    });
    dashboardRefreshPromise = runningRefresh();
    const currentRefresh = dashboardRefreshPromise;
    currentRefresh.then(
      () => { if (dashboardRefreshPromise === currentRefresh) dashboardRefreshPromise = null; },
      error => {
        if (dashboardRefreshPromise === currentRefresh) dashboardRefreshPromise = null;
        if (allowStale && !forceRefresh && refreshRevision === settingsRevision) {
          dashboardEvents.failed(); console.error("Hintergrundaktualisierung fehlgeschlagen:", error.message);
        }
      }
    );
  }

  // Opening the page must not wait for a full account-history rebuild. Return
  // the last verified document with its ORIGINAL timestamp while refreshing it.
  if (allowStale && !forceRefresh && cached?.calculationVersion === DASHBOARD_CALCULATION_VERSION) {
    return { ...cached, cache: { status: "stale", updating: true, ageMs: Date.now() - cachedAt, maxAgeMs: BACKGROUND_REFRESH_MS } };
  }

  const fresh = await dashboardRefreshPromise;

  return {
    ...fresh,
    cache: {
      status: "refresh",
      ageMs: 0,
      maxAgeMs: DASHBOARD_CACHE_MS
    }
  };
}

function getWalletSymbol(wallet) {
  const attributes = wallet.attributes || {};

  return normalizeSymbol(
    attributes.cryptocoin_symbol ||
    attributes.asset_symbol ||
    attributes.symbol ||
    attributes.ticker ||
    attributes.name?.replace(/\s+wallet$/i, "") ||
    attributes.cryptocoin_id ||
    attributes.asset_id
  );
}

function getWalletBalance(wallet) {
  const attributes = wallet.attributes || {};

  return Number(
    attributes.balance ||
    attributes.available_balance ||
    attributes.amount ||
    0
  );
}

function collectWallets(value, wallets = []) {
  if (!value || typeof value !== "object") return wallets;

  if (value.type === "wallet" && value.attributes) {
    wallets.push(value);
    return wallets;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectWallets(item, wallets);
    return wallets;
  }

  for (const item of Object.values(value)) {
    collectWallets(item, wallets);
  }

  return wallets;
}

async function fetchWalletBalances() {
  const response = await fetch(`${BASE_URL}/asset-wallets`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bitpanda Wallet Fehler: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const balances = new Map();

  for (const wallet of collectWallets(data.data || data)) {
    const symbol = getWalletSymbol(wallet);
    if (!symbol) continue;

    balances.set(symbol, {
      balance: getWalletBalance(wallet),
      walletName: wallet.attributes?.name || symbol,
      walletId: wallet.id || null
    });
  }

  return balances;
}

async function fetchFiatWalletBalances() {
  const response = await fetch(`${BASE_URL}/fiatwallets`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bitpanda Fiat Wallet Fehler: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return (data.data || []).map(wallet => {
    const attributes = wallet.attributes || {};
    const symbol = normalizeSymbol(attributes.fiat_symbol);
    const balance = Number(attributes.balance || 0);

    return {
      symbol,
      name: attributes.name || `${symbol} Wallet`,
      balance: Number.isFinite(balance) ? balance : 0,
      eurValue: symbol === "EUR" && Number.isFinite(balance) ? balance : 0,
      pendingTransactions: Number(attributes.pending_transactions_count || 0)
    };
  });
}

async function fetchCryptoWalletTransactions() {
  return fetchPaginated("/wallets/transactions", {
    status: "finished"
  });
}

async function fetchReservedCryptoTransactions() {
  try {
    return await fetchPaginated("/wallets/transactions", { status: "pending" });
  } catch {
    // Some API keys do not expose pending wallet movements. Finished reservations
    // are also checked in the regular wallet history below.
    return [];
  }
}

function normalizeReservedPosition(transaction) {
  const attributes = transaction.attributes || {};
  const symbol = getAssetName(transaction);
  const quantity = getTradeAmountAsset(transaction);

  if (!symbol || symbol === "UNKNOWN" || !Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    id: transaction.id,
    assetKey: symbol,
    name: getAssetDisplayName(symbol),
    quantity,
    status: attributes.status || "",
    direction: attributes.in_or_out || "",
    type: attributes.type || "",
    date: attributes.time?.date_iso8601 || null,
    note: "Fusion Limit Order · Guthaben reserviert"
  };
}

function getReservedPositions(transactions = []) {
  const seen = new Set();
  return transactions
    .filter(isReservedTransaction)
    .map(normalizeReservedPosition)
    .filter(item => item && !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function isBitpandaCustodyTransfer(transaction) {
  const attributes = transaction.attributes || {};
  const type = String(attributes.type || "").toLowerCase();
  const status = String(attributes.status || "").toLowerCase();
  const tags = (attributes.tags || [])
    .map(tag => String(tag?.attributes?.short_name || tag?.attributes?.name || "").toLowerCase());

  return (
    type === "transfer" &&
    status === "finished" &&
    (tags.includes("stake") || tags.includes("unstake")) &&
    !attributes.tx_id &&
    !attributes.related_wallet_transaction_id &&
    !attributes.related_wallet_id
  );
}

function calculateBitpandaCustodyBalances(transactions = []) {
  const balances = new Map();

  for (const transaction of transactions) {
    if (!isBitpandaCustodyTransfer(transaction)) continue;

    const attributes = transaction.attributes || {};
    const tags = (attributes.tags || [])
      .map(tag => String(tag?.attributes?.short_name || tag?.attributes?.name || "").toLowerCase());
    const symbol = normalizeSymbol(attributes.cryptocoin_symbol || attributes.asset_symbol);
    const amount = Number(attributes.amount || 0);

    if (!symbol || !Number.isFinite(amount) || amount <= 0) continue;

    const current = balances.get(symbol) || {
      balance: 0,
      incoming: 0,
      outgoing: 0,
      transactionCount: 0
    };
    const signedAmount = tags.includes("unstake") ? -amount : amount;

    current.balance += signedAmount;
    current.transactionCount += 1;
    if (tags.includes("unstake")) current.incoming += amount;
    if (tags.includes("stake")) current.outgoing += amount;

    balances.set(symbol, current);
  }

  for (const [symbol, item] of balances.entries()) {
    item.balance = Math.max(0, item.balance);
    if (item.balance <= 0.00000001) {
      balances.delete(symbol);
    }
  }

  return balances;
}

function reconcileOpenPositionsWithWallets(openPositions, walletBalances, custodyBalances = new Map()) {
  const visible = [];
  const hidden = [];
  const mismatches = [];
  const epsilon = 0.00000001;

  for (const position of openPositions) {
    const symbol = normalizeSymbol(position.assetKey || position.name);
    const wallet = walletBalances.get(symbol);

    if (!wallet) {
      visible.push({
        ...position,
        walletBalance: null,
        walletReconciled: false
      });
      continue;
    }

    const reconstructedQuantity = Number(position.currentQuantity || 0);
    const walletBalance = Number(wallet.balance || 0);
    const custody = custodyBalances.get(symbol) || null;
    const custodyBalance = Number(custody?.balance || 0);
    const effectiveWalletBalance = walletBalance + custodyBalance;

    if (effectiveWalletBalance <= epsilon) {
      hidden.push({
        asset: position.name,
        reconstructedQuantity,
        walletBalance,
        custodyBalance,
        reason: "wallet_balance_zero"
      });
      continue;
    }

    const quantityDifference = effectiveWalletBalance - reconstructedQuantity;
    const averageRemainingCost = reconstructedQuantity > epsilon
      ? Number(position.costBasis || 0) / reconstructedQuantity
      : 0;
    const costBasis = averageRemainingCost * effectiveWalletBalance;

    if (Math.abs(quantityDifference) > epsilon) {
      mismatches.push({
        asset: position.name,
        reconstructedQuantity,
        walletBalance,
        custodyBalance,
        effectiveWalletBalance,
        difference: quantityDifference
      });
    }

    visible.push({
      ...position,
      currentQuantity: effectiveWalletBalance,
      costBasis,
      averageRemainingCost: effectiveWalletBalance > epsilon ? costBasis / effectiveWalletBalance : 0,
      walletBalance,
      custodyBalance,
      custodySource: custodyBalance > epsilon ? "Bitpanda Custody" : null,
      custodyTransactionCount: custody?.transactionCount || 0,
      walletName: wallet.walletName,
      walletId: wallet.walletId,
      walletReconciled: true,
      reconstructedQuantity,
      quantityDifference
    });
  }

  return {
    openPositions: visible,
    reconciliation: {
      source: "Bitpanda asset-wallets",
      hiddenZeroBalancePositions: hidden,
      quantityMismatches: mismatches
    }
  };
}

function textOf(item) {
  return JSON.stringify(item.attributes || {}).toLowerCase();
}

function isFinished(item) {
  const status = (item.attributes?.status || "").toLowerCase();
  return status === "finished";
}

function isReservedTransaction(transaction) {
  const text = textOf(transaction);
  const tags = transaction.attributes?.tags || [];

  const hasReserveTag = tags.some(tag =>
    tag?.attributes?.short_name?.toLowerCase().includes("reserve") ||
    tag?.attributes?.name?.toLowerCase().includes("reserve")
  );

  return (
    hasReserveTag ||
    text.includes("reserved") ||
    text.includes("reservation") ||
    text.includes("guthaben reserviert") ||
    text.includes("authorization") ||
    text.includes("authorisation") ||
    text.includes("preauthorization") ||
    text.includes("pre_authorization") ||
    text.includes("pending")
  );
}

function isDividendTransaction(transaction) {
  const text = textOf(transaction);
  const tags = transaction.attributes?.tags || [];

  const tagText = tags
    .map(tag => `${tag?.attributes?.short_name || ""} ${tag?.attributes?.name || ""}`)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("dividend") ||
    text.includes("dividende") ||
    text.includes("dividenden") ||
    text.includes("distribution") ||
    text.includes("distributions") ||
    text.includes("corporate_action") ||
    text.includes("corporate action") ||
    text.includes("cash dividend") ||
    tagText.includes("dividend") ||
    tagText.includes("dividende") ||
    tagText.includes("distribution") ||
    tagText.includes("corporate_action")
  );
}

function getTransactionTags(transaction) {
  return (transaction.attributes?.tags || [])
    .map(tag => tag?.attributes?.short_name || tag?.attributes?.name || "")
    .filter(Boolean);
}

function getSignedTransactionAmount(transaction) {
  const amount = Math.abs(Number(transaction.attributes?.amount || 0));
  const direction = String(transaction.attributes?.in_or_out || "").toLowerCase();

  return direction === "outgoing" ? -amount : amount;
}

function getDividendSource(transaction) {
  const attributes = transaction.attributes || {};
  const tags = getTransactionTags(transaction);
  const tagText = tags.join(" ").toLowerCase();
  const corporateActionAssetId = attributes.corporate_action_asset_id;

  if (tagText.includes("cashplus") || corporateActionAssetId === "2941") {
    return "Bitpanda Cash Plus";
  }

  if (tagText.includes("src_tax")) {
    return "Quellensteuer Dividende";
  }

  if (corporateActionAssetId) {
    return CORPORATE_ACTION_ASSET_NAMES[corporateActionAssetId] || `Corporate Action ${corporateActionAssetId}`;
  }

  if (tagText.includes("ca.dividend") || tagText.includes("dividend")) {
    return "Dividende";
  }

  return attributes.from || attributes.recipient || "Dividende";
}

function getDividendAssetLabel(transaction) {
  const attributes = transaction.attributes || {};
  const tags = getTransactionTags(transaction);
  const tagText = tags.join(" ").toLowerCase();
  const corporateActionAssetId = attributes.corporate_action_asset_id;

  if (tagText.includes("cashplus") || corporateActionAssetId === "2941") {
    return "Bitpanda Cash Plus";
  }

  if (corporateActionAssetId) {
    return CORPORATE_ACTION_ASSET_NAMES[corporateActionAssetId] || `Corporate Action ${corporateActionAssetId}`;
  }

  return "Dividendenbuchung";
}

function getDividendBookingType(transaction) {
  const tags = getTransactionTags(transaction);
  const tagText = tags.join(" ").toLowerCase();

  if (tagText.includes("src_tax")) return "Quellensteuer";
  if (tagText.includes("cashplus")) return "Cash Plus Reward";
  return "Dividende";
}

function normalizeDividendDetails(dividends = []) {
  return dividends.map(transaction => {
    const attributes = transaction.attributes || {};
    const amount = getSignedTransactionAmount(transaction);
    const fee = Math.abs(Number(attributes.fee || 0));
    const tags = getTransactionTags(transaction);

    return {
      id: transaction.id,
      date: attributes.time?.date_iso8601 || null,
      month: monthKeyFromItem(transaction),
      year: yearKeyFromItem(transaction),
      source: getDividendSource(transaction),
      asset: getDividendAssetLabel(transaction),
      bookingType: getDividendBookingType(transaction),
      amount,
      fee: Number.isFinite(fee) ? fee : 0,
      grossAmount: amount > 0 && Number.isFinite(fee) ? amount + fee : amount,
      direction: attributes.in_or_out || "",
      type: attributes.type || "",
      from: attributes.from || "",
      recipient: attributes.recipient || "",
      corporateActionAssetId: attributes.corporate_action_asset_id || "",
      tags
    };
  });
}

function isCardTransaction(transaction) {
  const attributes = transaction.attributes || {};
  const text = textOf(transaction);

  return (
    attributes.is_card === true ||
    attributes.is_card_order_charge === true ||
    text.includes("card") ||
    text.includes("visa") ||
    text.includes("bp card") ||
    text.includes("bitpanda card")
  );
}

function isOnlyWantedFiatMovement(transaction) {
  const attributes = transaction.attributes || {};
  const type = (attributes.type || "").toLowerCase();
  const direction = (attributes.in_or_out || "").toLowerCase();

  if (!isFinished(transaction)) return false;
  if (isReservedTransaction(transaction)) return false;
  if (isDividendTransaction(transaction)) return false;

  const isDeposit = type === "deposit" && direction === "incoming";
  const isWithdrawal = type === "withdrawal" && direction === "outgoing";
  const isTransferOut = type === "transfer" && direction === "outgoing";

  return isDeposit || isWithdrawal || isTransferOut;
}

async function fetchWantedFiatMovements() {
  const typesToLoad = ["deposit", "withdrawal", "transfer"];
  const groups = await Promise.all(typesToLoad.map(type => fetchPaginated("/fiatwallets/transactions", { type, status: "finished" })));
  const results = groups.flat();

  return uniqueById(results)
    .filter(isOnlyWantedFiatMovement)
    .sort((a, b) => Number(b.attributes?.time?.unix || 0) - Number(a.attributes?.time?.unix || 0));
}

async function fetchDividendMovements() {
  // Dividenden können je nach Bitpanda-JSON als transfer/refund/incoming o. Ä. erscheinen.
  // Deshalb laden wir finished Fiat-Transaktionen breiter und nehmen nur eindeutig als Dividende markierte Einträge.
  const typesToLoad = ["deposit", "withdrawal", "transfer", "refund"];
  const groups = await Promise.all(typesToLoad.map(type => fetchPaginated("/fiatwallets/transactions", { type, status: "finished" })));
  const results = groups.flat();

  return uniqueById(results)
    .filter(isFinished)
    .filter(transaction => !isReservedTransaction(transaction))
    .filter(isDividendTransaction)
    .sort((a, b) => Number(b.attributes?.time?.unix || 0) - Number(a.attributes?.time?.unix || 0));
}

function normalizeAssetName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function getAssetName(trade) {
  const a = trade.attributes || {};

  return normalizeAssetName(
    a.cryptocoin_symbol ||
    a.asset_symbol ||
    a.symbol ||
    a.name ||
    a.asset_name ||
    a.instrument_name ||
    a.cryptocoin_id ||
    a.asset_id ||
    a.instrument_id ||
    "UNKNOWN"
  );
}

function getAssetKey(trade) {
  // Wichtig:
  // Für Aktien/ETFs kann Bitpanda manchmal unterschiedliche interne IDs oder Wallet-IDs liefern.
  // Deshalb gruppieren wir primär nach Symbol/Name, damit z. B. RHM nicht doppelt erscheint.
  return getAssetName(trade);
}

const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "XRP", "DOGE", "ZEC", "ATOM", "QNT", "COREUM", "NAKA", "LEVER", "NIGHT", "PI", "EURCV", "BEST",
  "BTC1S", "ETH1S", "DBR", "VSN", "BC8",
  "ADA", "SOL", "DOT", "AVAX", "LINK", "MATIC", "POL", "LTC", "BCH", "TRX", "XLM", "VET", "NEAR", "UNI", "AAVE"
]);
const ETF_SYMBOLS = new Set([
  "S&P500", "SPYY", "MSCI-WORLD", "MSCI-EM", "ESGW", "IQQX", "ROBOTICS", "EURO-CLIMATE", "GLSCAP"
]);
const METAL_SYMBOLS = new Set(["XAU", "XAG", "XPT", "XPD", "PRECIOUS", "GOLDMINE", "VZLE"]);
const STOCK_SYMBOLS = new Set([
  "AAPL", "ALV", "AMZN", "COIN", "CUE", "CVX", "DRO", "EPR-US", "FB", "GOOG", "GOOGL", "HOOD", "MCD", "MSFT",
  "NKE", "NVDA", "NVO", "O-US", "OKTA", "PLTR", "RDSA", "RHM", "TSLA", "TTWO", "TX", "UEC", "VOW"
]);
const CASH_PLUS_SYMBOLS = new Set(["BCPEUR"]);

const ASSET_DISPLAY_NAMES = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ZEC: "Zcash",
  ATOM: "Cosmos",
  QNT: "Quant",
  COREUM: "Coreum",
  NAKA: "Nakamoto Games",
  LEVER: "LeverFi",
  NIGHT: "Midnight",
  PI: "Pi Network",
  EURCV: "EUR CoinVertible",
  DBR: "deBridge",
  VSN: "Vision",
  XAU: "Gold",
  XAG: "Silver",
  PRECIOUS: "Precious Metals Basket",
  GOLDMINE: "Gold Producers Basket",
  VZLE: "Physical Precious Metals",
  RHM: "Rheinmetall",
  MSFT: "Microsoft",
  FB: "Meta Platforms",
  DRO: "Droneshield",
  CUE: "Cue Biopharma",
  COIN: "Coinbase",
  HOOD: "Robinhood",
  CVX: "Chevron",
  GOOGL: "Alphabet Class A",
  GOOG: "Alphabet Class C",
  TTWO: "Take-Two Interactive",
  AAPL: "Apple",
  NVDA: "NVIDIA",
  "O-US": "Realty Income",
  "EPR-US": "EPR Properties",
  VOW: "Volkswagen",
  OKTA: "Okta",
  PLTR: "Palantir",
  NKE: "Nike",
  AMZN: "Amazon",
  NVO: "Novo Nordisk",
  TSLA: "Tesla",
  MCD: "McDonald's",
  UEC: "Uranium Energy",
  RDSA: "Shell",
  ALV: "Allianz",
  TX: "Ternium",
  SPYY: "MSCI ACWI (Acc)",
  "MSCI-EM": "MSCI Emerging Markets",
  "MSCI-WORLD": "MSCI World",
  ESGW: "MSCI World ESG",
  ROBOTICS: "Automation & Robotics",
  GLSCAP: "Global Small Cap",
  "EURO-CLIMATE": "Euro Climate",
  "S&P500": "S&P 500",
  IQQX: "Nasdaq 100",
  BC8: "Bitpanda Crypto Index 8",
  BCPEUR: "Bitpanda Cash Plus EUR"
};
const CORPORATE_ACTION_ASSET_NAMES = {
  2941: "Bitpanda Cash Plus"
};

const ASSET_CATEGORY_LABELS = {
  crypto: "Krypto",
  stock: "Aktien",
  etf: "ETFs",
  metal: "Metalle",
  other: "Sonstige"
};

function normalizeCategoryText(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function getAssetCategory(trade) {
  const a = trade.attributes || {};
  if (a.catalogAsset?.category && a.catalogAsset.category !== "other") return a.catalogAsset.category;
  const symbol = getAssetName(trade);
  const categoryText = [
    a.asset_type,
    a.asset_class,
    a.asset_group,
    a.instrument_type,
    a.instrument_subtype,
    a.asset_kind,
    a.wallet_type,
    a.cryptocoin_id ? "crypto" : "",
    a.cryptocoin_symbol ? "crypto" : "",
    a.amount_cryptocoin ? "crypto" : ""
  ].map(normalizeCategoryText).join(" ");

  if (CASH_PLUS_SYMBOLS.has(symbol)) return "other";
  if (categoryText.includes("etf") || ETF_SYMBOLS.has(symbol)) return "etf";
  if (categoryText.includes("metal") || categoryText.includes("commodity") || METAL_SYMBOLS.has(symbol)) return "metal";
  if (categoryText.includes("stock") || categoryText.includes("share") || STOCK_SYMBOLS.has(symbol) || symbol.includes("-US")) return "stock";
  if (categoryText.includes("crypto") || CRYPTO_SYMBOLS.has(symbol)) return "crypto";

  return "other";
}

function getTickerCategory(symbol, ticker = null) {
  const tickerType = normalizeCategoryText(ticker?.type);

  if (CASH_PLUS_SYMBOLS.has(symbol)) return "other";
  if (ETF_SYMBOLS.has(symbol)) return "etf";
  if (METAL_SYMBOLS.has(symbol)) return "metal";
  if (STOCK_SYMBOLS.has(symbol) || symbol.includes("-US")) return "stock";
  if (CRYPTO_SYMBOLS.has(symbol)) return "crypto";
  if (tickerType.includes("crypto")) return "crypto";
  if (tickerType.includes("metal") || tickerType.includes("commodity")) return "metal";
  if (tickerType.includes("etf")) return "etf";
  if (tickerType.includes("equity") || tickerType.includes("security") || tickerType.includes("stock")) return "stock";

  return "other";
}

function getAssetDisplayName(symbol, ticker = null) {
  const tickerName = String(ticker?.name || "").trim();

  if (tickerName && normalizeSymbol(tickerName) !== symbol) {
    return tickerName;
  }

  return ASSET_DISPLAY_NAMES[symbol] || symbol;
}

function getTradeAmountAsset(trade) {
  const a = trade.attributes || {};
  return Math.abs(Number(
    a.amount_cryptocoin ||
    a.amount_asset ||
    a.amount ||
    a.units ||
    0
  ));
}

function getTradeAmountFiat(trade) {
  const a = trade.attributes || {};
  return Math.abs(Number(
    a.amount_fiat ||
    a.current_fiat_amount ||
    a.amount_eur ||
    0
  ));
}

function getTradeFee(trade, category, quantity, fiat, isSavingsExecution = false) {
  const attributes = trade.attributes || {};

  const reportedFee = reportedTradeFee(trade);
  if (reportedFee != null) return reportedFee;

  // Savings matching is only a fallback when neither API supplied a fee.
  if (isSavingsExecution || attributes.is_savings === true) return 0;

  // Bitpanda's amount_fiat is the amount debited/credited after the fee, while
  // price × quantity is the trade value before the fee. Prefer this exact
  // difference over an assumed flat fee.
  const price = Number(attributes.price || 0);
  const grossTradeValue = price * Number(quantity || 0);
  const inferredFee = Math.abs(Number(fiat || 0) - grossTradeValue);
  if (Number.isFinite(inferredFee) && inferredFee > 0.000001) return inferredFee;

  if (category === "crypto" || Number(attributes.time?.unix || 0) < FIXED_TRADE_FEE_START_UNIX) return 0;
  return DEFAULT_TRADE_FEE_EUR;
}

function getTradeValueBeforeFee(trade, quantity, fiat, fee) {
  return tradeValueBeforeFee(trade, quantity, fiat, fee);
}

function dateFromUnix(unix) {
  if (!unix) return null;
  return new Date(Number(unix) * 1000);
}

function monthKeyFromItem(item) {
  const date = dateFromUnix(item.attributes?.time?.unix);
  if (!date) return "unbekannt";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yearKeyFromItem(item) {
  const date = dateFromUnix(item.attributes?.time?.unix);
  if (!date) return "unbekannt";
  return `${date.getFullYear()}`;
}

function createSavingsExecutionMatcher(transactions = []) {
  const savingsDeposits = transactions
    .filter(transaction => transaction?.attributes?.is_savings === true)
    .map(transaction => ({
      id: transaction.id,
      amount: Math.abs(Number(transaction.attributes?.amount || 0)),
      time: Number(transaction.attributes?.time?.unix || 0)
    }))
    .filter(deposit => deposit.amount > 0 && deposit.time > 0);
  const usedDepositIds = new Set();

  return trade => {
    const attributes = trade.attributes || {};
    if (attributes.is_savings === true) return true;
    if (String(attributes.type || "").toLowerCase() !== "buy") return false;

    const tradeTime = Number(attributes.time?.unix || 0);
    const tradeAmount = getTradeAmountFiat(trade);
    if (!tradeTime || !tradeAmount) return false;

    const matchingDeposit = savingsDeposits.find(deposit =>
      !usedDepositIds.has(deposit.id) &&
      Math.abs(deposit.time - tradeTime) <= 5 * 60 &&
      Math.abs(deposit.amount - tradeAmount) <= 0.02
    );
    if (!matchingDeposit) return false;

    usedDepositIds.add(matchingDeposit.id);
    return true;
  };
}

function addPeriod(map, key, defaults = {}) {
  if (!map.has(key)) {
    map.set(key, {
      period: key,
      ...defaults
    });
  }

  return map.get(key);
}

function calculateRealizedProfit(trades, savingsTransactions = [], paidTax = { available: false }) {
  const sorted = trades
    .filter(trade => (trade.attributes?.status || "").toLowerCase() === "finished")
    .filter(trade => ["buy", "sell"].includes((trade.attributes?.type || "").toLowerCase()))
    .filter(trade => !CASH_PLUS_SYMBOLS.has(getAssetKey(trade)))
    .sort((a, b) => Number(a.attributes?.time?.unix || 0) - Number(b.attributes?.time?.unix || 0));

  const assets = new Map();
  const monthlyMap = new Map();
  const yearlyMap = new Map();
  const realizedTrades = [];
  const isSavingsExecution = createSavingsExecutionMatcher(savingsTransactions);

  function addProfitToPeriod(map, key, grossProfit, tradingFee, estimatedTax, netProfit, soldFiat) {
    const item = addPeriod(map, key, {
      realizedProfit: 0,
      grossRealizedProfit: 0,
      tradingFees: 0,
      estimatedTax: 0,
      soldFiat: 0,
      sellCount: 0
    });

    item.realizedProfit += netProfit;
    item.grossRealizedProfit += grossProfit;
    item.tradingFees += tradingFee;
    item.estimatedTax += estimatedTax;
    item.soldFiat += soldFiat;
    item.sellCount += 1;
  }

  for (const trade of sorted) {
    const attributes = trade.attributes || {};
    const type = (attributes.type || "").toLowerCase();
    const key = getAssetKey(trade);
    const name = getAssetName(trade);
    const category = getAssetCategory(trade);
    const quantity = getTradeAmountAsset(trade);
    const fiat = getTradeAmountFiat(trade);
    const isSavings = isSavingsExecution(trade);
    const tradeFee = getTradeFee(trade, category, quantity, fiat, isSavings);
    const tradeValueBeforeFee = getTradeValueBeforeFee(trade, quantity, fiat, tradeFee);

    if (!quantity || !fiat || key === "unknown") continue;

    if (!assets.has(key)) {
      assets.set(key, {
        assetKey: key,
        name,
        displayName: attributes.catalogAsset?.name || ASSET_DISPLAY_NAMES[key] || name,
        assetId: attributes.catalogAsset?.id || null,
        isin: attributes.catalogAsset?.isin || null,
        metadataCategory: attributes.catalogAsset?.category !== "other" ? attributes.catalogAsset?.category || null : null,
        category,
        categoryLabel: ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other,
        totalBoughtFiat: 0,
        totalSoldFiat: 0,
        realizedProfit: 0,
        grossRealizedProfit: 0,
        tradingFees: 0,
        estimatedTax: 0,
        currentQuantity: 0,
        costBasis: 0,
        feeCostBasis: 0,
        buyCount: 0,
        sellCount: 0,
        trades: []
      });
    }

    const asset = assets.get(key);
    if (asset.category === "other" && category !== "other") {
      asset.category = category;
      asset.categoryLabel = ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other;
    }

    if (type === "buy") {
      asset.totalBoughtFiat += fiat;
      asset.currentQuantity += quantity;
      asset.costBasis += tradeValueBeforeFee;
      asset.feeCostBasis += tradeFee;
      asset.tradingFees += tradeFee;
      asset.buyCount += 1;

      asset.trades.push({
        id: trade.id,
        type: "buy",
        quantity,
        fiat,
        tradeValueBeforeFee,
        tradingFee: tradeFee,
        feeSource: reportedTradeFee(trade) != null ? (attributes.dashboardFeeSource || 'trades') : 'calculated',
        isSavings,
        price: attributes.price || null,
        realizedProfit: null,
        time: attributes.time || null,
        month: monthKeyFromItem(trade),
        year: yearKeyFromItem(trade)
      });
    }

    if (type === "sell") {
      const avgCost = asset.currentQuantity > 0 ? asset.costBasis / asset.currentQuantity : 0;
      const costOfSoldQuantity = avgCost * quantity;
      const { allocatedBuyFee, unmatchedQuantity } = allocateSalePurchaseFees(quantity, asset.currentQuantity, asset.feeCostBasis);
      asset.unmatchedSoldQuantity = Number(asset.unmatchedSoldQuantity || 0) + unmatchedQuantity;
      const grossProfit = tradeValueBeforeFee - costOfSoldQuantity;
      const tradingFee = allocatedBuyFee + tradeFee;
      const financingFee = Number(attributes.financingFee || 0);
      const profitBeforeTax = grossProfit - tradingFee - financingFee;
      const hasTaxData = paidTax.available && Object.hasOwn(paidTax.tradeTaxes, trade.id);
      // Kept as a compatibility field for existing views; it now contains only
      // booked tax after directly linked refunds, never a 27.5% estimate.
      const estimatedTax = hasTaxData ? paidTax.tradeTaxes[trade.id] : 0;
      const taxSource = hasTaxData ? "bitpanda_bookings" : "unavailable";
      const profit = profitBeforeTax - estimatedTax;

      asset.financingFees = Number(asset.financingFees || 0) + financingFee;
      asset.realizedProfit += profit;
      asset.grossRealizedProfit += grossProfit;
      asset.tradingFees += tradeFee;
      asset.estimatedTax += estimatedTax;
      asset.totalSoldFiat += fiat;
      asset.currentQuantity = Math.max(0, asset.currentQuantity - quantity);
      asset.costBasis = Math.max(0, asset.costBasis - costOfSoldQuantity);
      asset.feeCostBasis = Math.max(0, asset.feeCostBasis - allocatedBuyFee);
      asset.sellCount += 1;

      const month = monthKeyFromItem(trade);
      const year = yearKeyFromItem(trade);

      addProfitToPeriod(monthlyMap, month, grossProfit, tradingFee + financingFee, 0, profitBeforeTax, fiat);
      addProfitToPeriod(yearlyMap, year, grossProfit, tradingFee + financingFee, 0, profitBeforeTax, fiat);

      asset.trades.push({
        id: trade.id,
        type: "sell",
        quantity,
        fiat,
        tradeValueBeforeFee,
        grossRealizedProfit: grossProfit,
        financingFee,
        financingFeeBookings: attributes.financingFeeBookings || [],
        tradingFee: tradeFee,
        feeSource: reportedTradeFee(trade) != null ? (attributes.dashboardFeeSource || 'trades') : 'calculated',
        isSavings,
        allocatedBuyFee,
        unmatchedQuantity,
        estimatedTax,
        taxSource,
        price: attributes.price || null,
        realizedProfit: profit,
        costBasisSold: costOfSoldQuantity,
        time: attributes.time || null,
        month,
        year
      });
      realizedTrades.push({
        id: trade.id,
        assetKey: key,
        asset: asset.displayName || name,
        category: asset.category,
        month,
        year,
        date: attributes.time?.date_iso8601 || null,
        grossRealizedProfit: grossProfit,
        financingFee,
        tradingFee: tradingFee + financingFee,
        estimatedTax,
        taxSource,
        realizedProfit: profit
      });
    }
  }

  // Refunds and payments belong to their actual booking month/year, including
  // general corrections that Bitpanda does not assign to a particular asset.
  for (const event of paidTax.events || []) {
    if (event.category !== "sales") continue;
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit" }).formatToParts(new Date(event.date));
    const month = `${event.year}-${parts.find(part => part.type === "month").value}`;
    for (const [map, key] of [[monthlyMap, month], [yearlyMap, event.year]]) {
      const period = addPeriod(map, key, { realizedProfit: 0, grossRealizedProfit: 0, tradingFees: 0, estimatedTax: 0, soldFiat: 0, sellCount: 0 });
      period.estimatedTax += event.amount;
      period.realizedProfit -= event.amount;
    }
  }

  const assetsArray = Array.from(assets.values())
    .map(asset => {
      const sortedTrades = [...asset.trades].sort((a, b) => {
        const aTime = Number(a.time?.unix || 0);
        const bTime = Number(b.time?.unix || 0);
        return bTime - aTime;
      });

      return {
        ...asset,
        trades: sortedTrades,
        averageRemainingCost: asset.currentQuantity > 0 ? asset.costBasis / asset.currentQuantity : 0,
        remainingFeeCostBasis: asset.feeCostBasis,
        absoluteProfit: Math.abs(asset.realizedProfit)
      };
    })
    .sort((a, b) => b.absoluteProfit - a.absoluteProfit);

  const openPositions = assetsArray
    .filter(asset => Number(asset.currentQuantity || 0) > 0.00000001)
    .sort((a, b) => Number(b.costBasis || 0) - Number(a.costBasis || 0));
  const categorySummary = summarizeProfitLossByCategory(assetsArray);

  const warnings = assetsArray
    .filter(asset => Number(asset.unmatchedSoldQuantity || 0) > 0.00000002)
    .map(asset => ({
      type: "possible_missing_buy_history",
      asset: asset.name,
      message: "Für einen Teil der verkauften Menge fehlt eine Kaufkostenbasis in der Handelshistorie (z. B. Rewards oder Transfers). Das berechnete Ergebnis kann deshalb abweichen."
    }));

  return {
    assets: assetsArray,
    paidTax,
    unallocatedTaxAdjustment: paidTax.available
      ? paidTax.salesPaid - assetsArray.reduce((sum, asset) => sum + asset.estimatedTax, 0)
      : 0,
    realizedTrades: realizedTrades.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    openPositions,
    categorySummary,
    warnings,
    monthly: Array.from(monthlyMap.values()).sort((a, b) => b.period.localeCompare(a.period)),
    yearly: Array.from(yearlyMap.values()).sort((a, b) => b.period.localeCompare(a.period)),
    top: {
      best: [...assetsArray].sort((a, b) => b.realizedProfit - a.realizedProfit).slice(0, 5),
      worst: [...assetsArray].sort((a, b) => a.realizedProfit - b.realizedProfit).slice(0, 5),
      biggestMoves: assetsArray.slice(0, 5),
      mostTraded: [...assetsArray].sort((a, b) => (b.buyCount + b.sellCount) - (a.buyCount + a.sellCount)).slice(0, 5)
    }
  };
}

function summarizeProfitLossByCategory(assets = []) {
  const summary = new Map();

  for (const asset of assets) {
    const category = asset.category || "other";
    const item = addPeriod(summary, category, {
      category,
      categoryLabel: ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other,
      assetCount: 0,
      realizedProfit: 0,
      totalBoughtFiat: 0,
      totalSoldFiat: 0,
      costBasis: 0,
      currentQuantity: 0
    });

    item.assetCount += 1;
    item.realizedProfit += Number(asset.realizedProfit || 0);
    item.totalBoughtFiat += Number(asset.totalBoughtFiat || 0);
    item.totalSoldFiat += Number(asset.totalSoldFiat || 0);
    item.costBasis += Number(asset.costBasis || 0);
    item.currentQuantity += Number(asset.currentQuantity || 0);
  }

  return Array.from(summary.values()).sort((a, b) => {
    const aAbs = Math.abs(Number(a.realizedProfit || 0));
    const bAbs = Math.abs(Number(b.realizedProfit || 0));
    return bAbs - aAbs;
  });
}

function enrichAssetWithTickerMetadata(asset, tickerPrices) {
  const symbol = normalizeSymbol(asset.assetKey || asset.name);
  const ticker = tickerPrices.get(symbol);
  const category = asset.metadataCategory || getTickerCategory(symbol, ticker);
  const safeTicker = ticker && catalogCategory(ticker) === category ? ticker : null;
  const currentPrice = safeTicker ? Number(safeTicker.price || 0) : null;

  return {
    ...asset,
    displayName: asset.metadataCategory ? asset.displayName : getAssetDisplayName(symbol, safeTicker),
    category,
    categoryLabel: ASSET_CATEGORY_LABELS[category] || ASSET_CATEGORY_LABELS.other,
    tickerType: safeTicker?.type || null,
    currentPrice,
    priceChangeDay: safeTicker ? Number(safeTicker.price_change_day || 0) : null,
    priceCurrency: safeTicker?.currency || null,
    priceSource: safeTicker ? "Bitpanda Price Ticker" : null
  };
}

function rebuildProfitLossTopLists(assets) {
  return {
    best: [...assets].sort((a, b) => b.realizedProfit - a.realizedProfit).slice(0, 5),
    worst: [...assets].sort((a, b) => a.realizedProfit - b.realizedProfit).slice(0, 5),
    biggestMoves: assets.slice(0, 5),
    mostTraded: [...assets].sort((a, b) => (b.buyCount + b.sellCount) - (a.buyCount + a.sellCount)).slice(0, 5)
  };
}

function enrichProfitLossWithTickerMetadata(profitLoss, tickerPrices) {
  const assets = (profitLoss.assets || []).map(asset => enrichAssetWithTickerMetadata(asset, tickerPrices));
  const assetsByKey = new Map(assets.map(asset => [String(asset.assetKey), asset]));
  const openPositions = (profitLoss.openPositions || []).map(position => ({
    ...position,
    ...assetsByKey.get(String(position.assetKey))
  }));

  return {
    ...profitLoss,
    assets,
    openPositions,
    categorySummary: summarizeProfitLossByCategory(assets),
    top: rebuildProfitLossTopLists(assets)
  };
}

function calculateFiatPeriods(transactions, dividends = []) {
  const monthly = new Map();
  const yearly = new Map();

  function addFiat(map, key, transaction) {
    const type = (transaction.attributes?.type || "").toLowerCase();
    const direction = (transaction.attributes?.in_or_out || "").toLowerCase();
    const amount = Math.abs(Number(transaction.attributes?.amount || 0));

    const item = addPeriod(map, key, {
      deposits: 0,
      withdrawals: 0,
      dividends: 0,
      dividendGross: 0,
      dividendTax: 0,
      net: 0,
      count: 0,
      dividendCount: 0
    });

    if (type === "deposit" && direction === "incoming") {
      item.deposits += amount;
      item.net += amount;
    } else if (type === "withdrawal" && direction === "outgoing") {
      item.withdrawals += amount;
      item.net -= amount;
    } else if (type === "transfer" && direction === "outgoing" && isCardTransaction(transaction)) {
      // Card bleibt in Fiat Netto enthalten, aber nicht mehr als eigene Spalte in der UI.
      item.withdrawals += amount;
      item.net -= amount;
    }

    item.count += 1;
  }

  function addDividend(map, key, transaction) {
    const amount = getSignedTransactionAmount(transaction);

    const item = addPeriod(map, key, {
      deposits: 0,
      withdrawals: 0,
      dividends: 0,
      dividendGross: 0,
      dividendTax: 0,
      net: 0,
      count: 0,
      dividendCount: 0
    });

    item.dividends += amount;
    if (amount >= 0) {
      item.dividendGross += amount;
    } else {
      item.dividendTax += amount;
    }
    item.dividendCount += 1;
  }

  for (const transaction of transactions) {
    addFiat(monthly, monthKeyFromItem(transaction), transaction);
    addFiat(yearly, yearKeyFromItem(transaction), transaction);
  }

  for (const dividend of dividends) {
    addDividend(monthly, monthKeyFromItem(dividend), dividend);
    addDividend(yearly, yearKeyFromItem(dividend), dividend);
  }

  return {
    monthly: Array.from(monthly.values()).sort((a, b) => b.period.localeCompare(a.period)),
    yearly: Array.from(yearly.values()).sort((a, b) => b.period.localeCompare(a.period))
  };
}

async function fetchProfitLoss(savingsTransactions = [], { includeAccountInputs = false, financingRequest } = {}) {
  const inputsRequest = Promise.allSettled([
    fetchPublicPaginated("/operations", {}, Number.POSITIVE_INFINITY), getPublicEurCurrencyId(), (financingRequest || fetchCryptoWalletTransactions()).catch(() => [])
  ]);
  const metadataRequest = includeAccountInputs ? Promise.allSettled([
    publicApiRequest("/currencies"), publicApiRequest("/portfolio"),
    fetchPaginated("/fiatwallets/transactions", { status: "finished" })
  ]) : null;
  const [buys, sells] = await Promise.all([
    fetchPaginated("/trades", { type: "buy" }),
    fetchPaginated("/trades", { type: "sell" })
  ]);
  let trades = uniqueById([...buys, ...sells]);
  let paidTax;
  let accountInputs;
  try {
    const inputResults = await inputsRequest;
    const failedInput = inputResults.find(result => result.status === "rejected");
    if (failedInput) throw failedInput.reason;
    const [operations, eurCurrencyId, financingTransactions] = inputResults.map(result => result.value);
    paidTax = calculatePaidTax(operations, { eurCurrencyId, trades });
    trades = enrichTradesWithLeverageFees(enrichTradesWithBookedFees(trades, operations, eurCurrencyId), operations, eurCurrencyId, financingTransactions);
    if (includeAccountInputs) {
      const results = await metadataRequest;
      const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback;
      const portfolio = value(1, {}).data || [];
      const assetResult = await Promise.allSettled([accountAssetCatalog.load(operations, portfolio, trades)]);
      accountInputs = { operations, eurCurrencyId, trades, assets: assetResult[0].status === 'fulfilled' ? assetResult[0].value : [], currencies: value(0, {}).data || [], portfolio, fiatTransactions: value(2, []), portfolioError: results[1].status === 'rejected' ? 'Bitpanda-Portfolio konnte nicht geladen werden.' : null, metadataErrors: [...(assetResult[0].status === 'rejected' ? ['Assetnamen konnten nicht geladen werden.'] : []), ...results.flatMap((r, i) => r.status === 'rejected' ? [`${['Währungen', 'Portfolio', 'Fiat-Belege'][i]} konnten nicht geladen werden.`] : [])] };
    } else {
      const catalog = await accountAssetCatalog.load(operations, [], trades).catch(() => []);
      trades = enrichTradeAssetIdentity(trades, operations, catalog);
    }
  } catch {
    paidTax = { available: false, error: "Bezahlte KESt konnte nicht vollständig aus den Bitpanda-Buchungen geladen werden." };
  }
  if (accountInputs) trades = enrichTradeAssetIdentity(trades, accountInputs.operations, accountInputs.assets);
  const profitLoss = calculateRealizedProfit(trades, savingsTransactions, paidTax);

  try {
    const tickerPrices = await fetchTickerPrices((profitLoss.assets || []).map(asset => asset.assetKey || asset.name));
    return { ...enrichProfitLossWithTickerMetadata(profitLoss, tickerPrices), accountInputs };
  } catch (error) {
    console.error(error);

    return {
      ...profitLoss,
      accountInputs,
      metadataError: error.message
    };
  }
}

let assetCatalogCache = null;
let assetCatalogPending = null;

async function publicAccountSnapshot() {
  const resources = {
    portfolio: () => publicApiRequest("/portfolio"),
    operations: () => fetchPublicPaginated("/operations", {}, 100),
    assets: () => loadPublicAssetCatalog(),
    currencies: () => publicApiRequest("/currencies"),
    earnConfigs: () => fetchPublicPaginated("/earn/configs", {}, 500),
    tradingLimits: () => publicApiRequest("/trading-limits")
  };
  const entries = await Promise.all(Object.entries(resources).map(async ([key, load]) => {
    try {
      const value = await load();
      return [key, { ok: true, data: Array.isArray(value) ? value : value?.data ?? value }];
    } catch (error) {
      if (key === "tradingLimits" && error.code === "trading_limit.not_configured") {
        return [key, { ok: true, data: null, notConfigured: true }];
      }
      return [key, { ok: false, error: error.message, code: error.code || undefined }];
    }
  }));
  return { resources: Object.fromEntries(entries), updatedAt: new Date().toISOString() };
}

app.get("/public-account", async (req, res) => {
  try { res.json(await publicAccountSnapshot()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get("/public-assets/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().toLowerCase();
    const category = String(req.query.category || "all");
    if (query.length < 2 || query.length > 100 || !["all", "stock", "etf", "crypto", "metal", "other"].includes(category)) throw new Error("Ungültige Asset-Suche.");
    const catalog = await loadPublicAssetCatalog();
    const rank = item => String(item.symbol || "").toLowerCase() === query || String(item.isin || "").toLowerCase() === query ? 0 : String(item.name || "").toLowerCase() === query ? 1 : String(item.symbol || "").toLowerCase().startsWith(query) ? 2 : 3;
    const matches = catalog.filter(item => {
      const itemCategory = publicAssetCategory(item);
      return (category === "all" || itemCategory === category) && [item.symbol, item.name, item.isin].some(value => String(value || "").toLowerCase().includes(query));
    }).sort((a, b) => rank(a) - rank(b) || Number(b.buy_active) - Number(a.buy_active) || String(a.name).localeCompare(String(b.name)));
    const unique = new Map();
    for (const item of matches) {
      const key = item.isin || item.id;
      const previous = unique.get(key);
      const score = value => Number(Boolean(value.buy_active)) + Number(Boolean(value.sell_active)) + (value.type === "equity_security" ? 1 : 0);
      if (!previous || score(item) > score(previous)) unique.set(key, item);
    }
    const selected = [...unique.values()].slice(0, 30);
    const now = Date.now();
    const items = await Promise.all(selected.map(async item => {
      let ticker = publicTickerCache.get(item.id);
      if (!ticker || now - ticker.loadedAt >= 30_000) {
        try {
          const payload = await publicApiRequest(`/tickers/${item.id}`);
          ticker = { loadedAt: now, value: { ...(payload?.data || {}), available: true } };
          publicTickerCache.set(item.id, ticker);
        } catch { ticker = { value: { available: false } }; }
      }
      return { id: item.id, symbol: item.symbol, name: item.name, isin: item.isin || "", category: publicAssetCategory(item), type: item.type, buyActive: Boolean(item.buy_active), sellActive: Boolean(item.sell_active), price: ticker.value?.available ? ticker.value.price : null, priceCurrencyId: ticker.value?.currency_id || null };
    }));
    res.json({ items, total: unique.size, source: "Bitpanda Public API" });
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.get("/public-tickers", async (req, res) => {
  try {
    const ids = [...new Set(String(req.query.asset_ids || "").split(",").filter(Boolean).map(id => cleanUuid(id, "Asset")))];
    if (!ids.length || ids.length > 40) throw new Error("Bitte 1 bis 40 Assets für die Kursabfrage angeben.");
    const now = Date.now();
    const items = await Promise.all(ids.map(async id => {
      const cached = publicTickerCache.get(id);
      if (cached && now - cached.loadedAt < 30_000) return cached.value;
      try {
        const payload = await publicApiRequest(`/tickers/${id}`);
        const value = { ...(payload?.data || {}), available: true };
        publicTickerCache.set(id, { loadedAt: now, value });
        return value;
      } catch (error) {
        return { asset_id: id, available: false, error: error.message };
      }
    }));
    res.json({ data: items, updatedAt: new Date().toISOString() });
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.post("/trading/quotes", async (req, res) => {
  try {
    const assetId = cleanUuid(req.body?.assetId, "Asset");
    const currencyId = await getPublicEurCurrencyId();
    const side = String(req.body?.side || "").toUpperCase();
    if (!["BUY", "SELL"].includes(side)) throw new Error("Handelsrichtung ist ungültig.");
    const mode = req.body?.mode === "quantity" ? "quantity" : "notional";
    const amount = cleanDecimal(req.body?.amount, mode === "quantity" ? "Stückzahl" : "Betrag");
    const payload = await publicApiRequest("/quotes", {
      method: "POST",
      body: { asset_id: assetId, currency_id: currencyId, side, [mode]: amount }
    });
    const quote = payload?.data;
    if (!quote?.quote_id) throw new Error("Bitpanda hat keine gültige Quote zurückgegeben.");
    res.json(quote);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.get("/fusion/overview", async (req, res) => {
  try {
    const [account, balances, pairs, tickers, orders, trades] = await Promise.all([
      fusionRequest("/account"), fusionRequest("/account/balances"), fusionRequest("/pairs"), fusionRequest("/tickers"),
      fusionRequest("/account/orders", { params: { limit: 100 } }), fusionRequest("/account/trades", { params: { limit: 100 } })
    ]);
    res.json({ account, balances, pairs, tickers, orders: orders?.data || orders || [], trades: trades?.data || trades || [], updatedAt: new Date().toISOString() });
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.get("/fusion/orderbook/:pair", async (req, res) => {
  try { res.json(await fusionRequest(`/orderbook/${fusionPair(req.params.pair)}`, { params: { depth: Math.min(100, Math.max(1, Number(req.query.depth) || 10)) } })); }
  catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.get("/fusion/candles/:pair", async (req, res) => {
  try {
    const interval = ["1m", "5m", "10m", "15m", "30m", "1h", "4h", "1d"].includes(req.query.interval) ? req.query.interval : "1h";
    res.json(await fusionRequest(`/candles/${fusionPair(req.params.pair)}`, { params: { interval, limit: Math.min(500, Math.max(1, Number(req.query.limit) || 120)) } }));
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.post("/fusion/orders", async (req, res) => {
  try {
    const body = buildFusionOrder(req.body);
    res.json(await fusionRequest("/account/orders", { method: "POST", body }));
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.delete("/fusion/orders/:id", async (req, res) => {
  try {
    if (req.body?.confirmation !== "ORDER STORNIEREN") throw new Error("Bitte die Stornobestätigung exakt eingeben.");
    const id = cleanUuid(req.params.id, "Order");
    await fusionRequest(`/account/orders/${id}`, { method: "DELETE" }); res.json({ canceled: true, id });
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.post("/trading/quotes/:id/accept", async (req, res) => {
  try {
    const quoteId = cleanUuid(req.params.id, "Quote");
    if (req.body?.confirmation !== "JETZT HANDELN") throw new Error("Bitte die Handelsbestätigung exakt eingeben.");
    const payload = await publicApiRequest(`/quotes/${quoteId}/accept`, { method: "POST" });
    const trade = payload?.data ?? payload;
    if (!trade?.trade_id) {
      throw new Error("Bitpanda hat keine Trade-ID als Ausführungsbestätigung geliefert. Bitte den Transaktionsverlauf prüfen, bevor die Quote erneut akzeptiert wird.");
    }
    res.json(trade);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.post("/earn/actions/:action", async (req, res) => {
  try {
    const action = String(req.params.action || "").toLowerCase();
    if (!["stake", "unstake"].includes(action)) throw new Error("Earn-Aktion ist ungültig.");
    if (req.body?.confirmation !== "EARN BESTÄTIGEN") throw new Error("Bitte die Earn-Bestätigung exakt eingeben.");
    const body = {
      config_id: cleanUuid(req.body?.configId, "Earn-Konfiguration"),
      wallet_id: cleanUuid(req.body?.walletId, "Wallet"),
      asset_amount: cleanDecimal(req.body?.amount, "Asset-Menge")
    };
    const payload = await publicApiRequest(`/earn/actions/${action}`, { method: "POST", body });
    res.json(payload?.data ?? payload);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.post("/trading-limits", async (req, res) => {
  try {
    if (req.body?.confirmation !== "LIMITS SPEICHERN") throw new Error("Bitte die Limit-Bestätigung exakt eingeben.");
    const body = {
      buy_limit: Number(cleanDecimal(req.body?.buyLimit, "Kauflimit", { allowZero: true })),
      sell_limit: Number(cleanDecimal(req.body?.sellLimit, "Verkaufslimit", { allowZero: true })),
      currency_id: await getPublicEurCurrencyId()
    };
    const payload = await publicApiRequest("/trading-limits", { method: "POST", body });
    res.json(payload?.data ?? payload);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

app.get("/assets/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const category = String(req.query.category || "all");
  if (query.length > 100 || !["all", "stock", "etf", "crypto", "metal", "other"].includes(category)) return res.status(400).json({ error: "Ungültige Suchanfrage." });
  if (query.length < 2) return res.json({ items: [], total: 0 });
  try {
    if (!assetCatalogCache || Date.now() - assetCatalogCache.loadedAt > 60 * 60 * 1000) {
      if (!assetCatalogPending) assetCatalogPending = loadAssetCatalog(apiKey).then(items => { assetCatalogCache = { items, loadedAt: Date.now() }; }).finally(() => { assetCatalogPending = null; });
      await assetCatalogPending;
    }
    const matches = searchCatalog(assetCatalogCache.items, query, category);
    res.json({ items: matches.slice(0, 30), total: matches.length, source: "Bitpanda-Assetkatalog" });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

const chartHistoryCache = new Map();
app.get("/market/history", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const range = String(req.query.range || "1y");
  const symbol = normalizeSymbol(String(req.query.symbol || ""));
  const name = String(req.query.name || "").trim();
  const category = String(req.query.category || "other");
  if (!Object.hasOwn(HISTORY_RANGES, range) || !symbol || symbol.length > 40 || name.length > 160) return res.status(400).json({ error: "Ungültiges Symbol oder ungültiger Zeitraum." });
  const source = req.query.source === "bitpanda" ? "bitpanda" : "market";
  const key = `${source}:${symbol}:${name}:${category}:${range}:EUR`;
  const cached = chartHistoryCache.get(key);
  if (cached && Date.now() - cached.loadedAt < MARKET_CACHE_MS) return res.json(cached.value);
  try {
    const value = await (source === "bitpanda" ? loadBitpandaChart : loadMarketHistory)({ symbol, name, category, range });
    if (chartHistoryCache.size >= 100) chartHistoryCache.delete(chartHistoryCache.keys().next().value);
    chartHistoryCache.set(key, { loadedAt: Date.now(), value });
    res.json(value);
  } catch (error) { res.status(502).json({ error: error.message || "Historische EUR-Kurse konnten nicht geladen werden." }); }
});

app.get("/market/search", (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  const items = MARKET_UNIVERSE
    .filter(item => !query || item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
    .slice(0, 12);
  res.json({ items, source: "Vordefinierte, gängige Wertpapier- und Krypto-Symbole" });
});

app.get("/market/quotes", async (req, res) => {
  try {
    const entries = JSON.parse(String(req.query.items || "[]"));
    // Portfolio-Assets werden zusätzlich zur eigenen Watchlist geladen. Ein
    // vollständiges Bitpanda-Portfolio kann deutlich mehr als 30 Symbole haben.
    if (!Array.isArray(entries) || entries.length > 150) throw new Error("Ungültige Watchlist-Anfrage.");
    const settled = await Promise.allSettled(entries.map(entry => fetchWatchlistQuote(entry)));
    res.json({
      items: settled.map((result, index) => result.status === "fulfilled"
        ? result.value
        : { ...entries[index], symbol: normalizeSymbol(entries[index]?.symbol), error: result.reason?.message || "Keine Kursdaten verfügbar." }),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/market/news", async (req, res) => {
  try {
    if (String(req.query.scope || "") === "all") {
      const queries = [
        "Aktien Börse Unternehmen",
        "ETFs Fonds Index",
        "Kryptowährungen Bitcoin Ethereum",
        "Wirtschaft Zinsen Inflation"
      ];
      const groups = await Promise.all(queries.map(query => fetchMarketNews(query, 12)));
      const items = [...new Map(groups.flat().map(item => [item.url, item])).values()]
        .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0))
        .slice(0, 24);
      return res.json({ items, query: "Alle Kategorien", source: "Google News RSS", updatedAt: new Date().toISOString() });
    }
    const query = String(req.query.q || "Aktien Kryptowährungen Wirtschaft");
    const items = await fetchMarketNews(query, 12);
    res.json({ items, query, source: "Google News RSS", updatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/market/analysis", async (req, res) => {
  const symbol = normalizeSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: "Bitte ein Symbol auswählen." });
  try {
    const category = String(req.query.category || marketCategory(symbol));
    const requestedName = String(req.query.name || marketName(symbol));
    const [asset, news, analyst] = await Promise.all([
      fetchWatchlistQuote({ symbol, category, name: requestedName }),
      fetchMarketNews(`${requestedName} ${symbol}`, 24).catch(() => []),
      fetchAnalystConsensus(symbol, category).catch(error => ({ available: false, message: error.message }))
    ]);
    const alignedAnalyst = alignAnalystCurrency(analyst, asset);
    res.json({ asset, news, analyst: alignedAnalyst, analysis: createMarketAnalysis(asset, news, alignedAnalyst), sources: [asset.source, "Google News RSS", ...(alignedAnalyst?.available ? [alignedAnalyst.source] : [])], updatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const transactions = await fetchWantedFiatMovements();
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/dividends", async (req, res) => {
  try {
    const dividends = await fetchDividendMovements();
    res.json(dividends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/fiat-summary", async (req, res) => {
  try {
    const transactions = await fetchWantedFiatMovements();
    const dividends = await fetchDividendMovements();
    res.json(calculateFiatPeriods(transactions, dividends));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/profit-loss", async (req, res) => {
  try {
    const profitLoss = await fetchProfitLoss();
    res.json(profitLoss);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/dashboard-summary", async (req, res) => {
  try {
    const dashboard = await getDashboardData({ forceRefresh: req.query.refresh === "1" });
    const fiat = calculateFiatPeriods(dashboard.transactions || [], dashboard.dividends || []);

    res.json({
      fiat,
      paidTax: dashboard.paidTax,
      dividendDetails: normalizeDividendDetails(dashboard.dividends || []),
      profitLoss: {
        monthly: dashboard.profitLoss.monthly,
        yearly: dashboard.profitLoss.yearly,
        realizedTrades: dashboard.profitLoss.realizedTrades || []
      },
      cache: dashboard.cache
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/open-positions", async (req, res) => {
  try {
    const dashboard = await getDashboardData({ forceRefresh: req.query.refresh === "1" });

    res.json({
      openPositions: dashboard.openPositions,
      warnings: dashboard.warnings,
      priceSummary: dashboard.priceSummary,
      reconciliation: dashboard.reconciliation,
      reservedPositions: dashboard.reservedPositions || [],
      leveragePositions: dashboard.leveragePositions || [],
      balanceError: dashboard.balanceError,
      priceError: dashboard.priceError,
      cache: dashboard.cache
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/cashflow-overrides", async (req, res) => {
  try {
    res.json(await readCashflowOverrides());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Cashflow-Korrekturen konnten nicht geladen werden." });
  }
});

app.put("/cashflow-overrides", async (req, res) => {
  if (!req.is("application/json")) return res.sendStatus(415);
  try {
    res.json(await writeCashflowOverrides(req.body || {}));
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ error: error.message || "Cashflow-Korrekturen konnten nicht gespeichert werden.", state: error.state });
  }
});

app.get("/widget/portfolio", async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json(compactWidgetData(data, await readCashflowOverrides()));
  } catch (error) {
    const preview = localPortfolioPreview(
      ensurePortfolioReturnFields(await readJsonFile(DASHBOARD_CACHE_FILE, null)),
      { enabled: PERSIST_CREDENTIALS && !AUTH_REQUIRED, calculationVersion: DASHBOARD_CALCULATION_VERSION }
    );
    if (preview) return res.json(compactWidgetData(preview, await readCashflowOverrides()));
    res.status(502).json({ error: "Portfolio konnte nicht aktualisiert werden." });
  }
});

app.get("/dashboard-data", async (req, res) => {
  try {
    const dashboard = await getDashboardData({ forceRefresh: req.query.refresh === "1", allowStale: true });
    await sendCompressedJson(req, res, dashboard);
  } catch (error) {
    console.error(error);
    const preview = localPortfolioPreview(
      ensurePortfolioReturnFields(await readJsonFile(DASHBOARD_CACHE_FILE, null)),
      { enabled: PERSIST_CREDENTIALS && !AUTH_REQUIRED, calculationVersion: DASHBOARD_CALCULATION_VERSION }
    );
    if (preview) return sendCompressedJson(req, res, preview);
    res.status(500).json({ error: error.message });
  }
});

app.post("/cache/refresh", async (req, res) => {
  try {
    const dashboard = await getDashboardData({ forceRefresh: true });
    res.json(dashboard);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, process.env.HOST || "127.0.0.1", () => {
  const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const paint = (code, text) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
  const bold = text => paint("1", text);
  const green = text => paint("38;5;48", text);
  const dim = text => paint("2", text);
  const cyan = text => paint("38;5;117", text);
  const localURL = `http://localhost:${PORT}`;
  const hostName = os.hostname().replace(/\.local$/i, "");
  const mobileURL = `http://${hostName}.local:${PORT}`;
  const banner = [
    "  ____ ___ _____ ____   _    _   _ ____    _  ",
    "  | __ )_ _|_   _|  _ \\ / \\  | \\ | |  _ \\  / \\ ",
    "  |  _ \\| | | | | |_) / _ \\ |  \\| | | | |/ _ \\",
    "  | |_) | | | | |  __/ ___ \\| |\\  | |_| / ___ \\",
    "  |____/___| |_| |_| /_/   \\_\\_| \\_|____/_/   \\_\\",
    "  ____    _    ____  _   _ ____   ___    _    ____  ____",
    "  |  _ \\  / \\  / ___|| | | | __ ) / _ \\  / \\  |  _ \\|  _ \\",
    "  | | | |/ _ \\ \\___ \\| |_| |  _ \\| | | |/ _ \\ | |_) | | | |",
    "  | |_| / ___ \\ ___) |  _  | |_) | |_| / ___ \\|  _ <| |_| |",
    "  |____/_/   \\_\\____/|_| |_|____/ \\___/_/   \\_\\_| \\_\\____/"
  ].join("\n");

  console.log(`
${green(banner)}
  ${bold("BITPANDA DASHBOARD")}  ${dim("Backend bereit")}

  ${green("●")} ${bold("Lokal")}    ${cyan(localURL)}
  ${green("●")} ${bold("iPhone")}   ${cyan(mobileURL)}

  ${dim("Daten")}    GET /dashboard-data
  ${dim("Refresh")}  POST /cache/refresh
`);
});

let backgroundRefreshTimeout;
function scheduleBackgroundRefresh() {
  const delay = BACKGROUND_REFRESH_MS - Date.now() % BACKGROUND_REFRESH_MS;
  backgroundRefreshTimeout = setTimeout(() => {
    scheduleBackgroundRefresh();
    if (!apiKey || savingSettings || dashboardRefreshPromise) return;
    dashboardEvents.refreshing();
    getDashboardData({ forceRefresh: true }).catch(error => {
      dashboardEvents.failed();
      console.error(`Automatische Aktualisierung fehlgeschlagen: ${error.message}`);
    });
  }, delay);
  backgroundRefreshTimeout.unref();
}
scheduleBackgroundRefresh();
