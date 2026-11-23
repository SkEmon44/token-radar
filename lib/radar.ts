// Launch radar model: the sealed DefiLlama snapshot in, a ranked board of pre-token protocols out.
//
// implied_value_usd = tvl_usd x peer_ratio(category) x momentum(change_7d) x drought(age_days)
//
//   peer_ratio  median market-cap / TVL of the protocols in the same snapshot whose token already
//               trades, by category, each peer winsorised to [PEER_MIN, PEER_MAX], blended in log space
//               with the all-category median (SHRINK pseudo-peers of weight, so one odd peer cannot set
//               a category) and clamped to [RATIO_MIN, RATIO_MAX]. It is measured, never typed in.
//   momentum    1 + clamp(change_7d, -50, 100) / 100 x MOMENTUM_WEIGHT  (change unknown: 1)
//   drought     DROUGHT_MIN + min(age_days, DROUGHT_DAYS) / DROUGHT_DAYS x DROUGHT_RANGE
//               (age unknown: the midpoint): a protocol that has held its TVL for longer with no
//               token has a proven base, so its token would price nearer its peers.
//
// No protocol name is special-cased: one function scores every row.

export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }

export const MODEL = {
  version: 'peer-ratio-1',
  shrink: 5,
  peer_min: 0.01,
  peer_max: 5,
  ratio_min: 0.04,
  ratio_max: 1.2,
  momentum_weight: 0.6,
  momentum_floor: -50,
  momentum_cap: 100,
  drought_min: 0.75,
  drought_range: 0.45,
  drought_days: 730,
};

/** Categories the house watchlist leaves out as wrapped, bridged, staked or custodial products. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGES = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
const DAY_MS = 86_400_000;

export const hasToken = (p: Protocol): boolean => p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;

/** A pre-token protocol the board may rank: no token recorded and not a derivative product. */
export function rankable(p: Protocol, watch: Set<string>): boolean {
  if (watch.has(p.slug)) return true;
  if (hasToken(p) || p.tvl_usd <= 0) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  return !EXCHANGES.test(p.name) && !VERSIONED.test(p.name) && !WRAPPED.test(p.name);
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const d = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`)) / DAY_MS);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

export interface PeerRatio { category: string; peers: number; median: number | null; ratio: number }

/** Market cap / TVL of the snapshot's own live-token protocols, by category, shrunk to the global median. */
export function peerRatios(protocols: Protocol[]): { global: number; peers: number; byCategory: Map<string, PeerRatio> } {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const r = clamp(p.mcap_usd / p.tvl_usd, MODEL.peer_min, MODEL.peer_max);
    all.push(r);
    const key = p.category ?? 'Uncategorised';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const global = all.length ? median(all) : 0.2;
  const byCategory = new Map<string, PeerRatio>();
  for (const p of protocols) {
    const key = p.category ?? 'Uncategorised';
    if (byCategory.has(key)) continue;
    const xs = groups.get(key) ?? [];
    const med = xs.length ? median(xs) : null;
    const blended = med === null ? global : Math.exp((xs.length * Math.log(med) + MODEL.shrink * Math.log(global)) / (xs.length + MODEL.shrink));
    byCategory.set(key, { category: key, peers: xs.length, median: med === null ? null : round4(med), ratio: round4(clamp(blended, MODEL.ratio_min, MODEL.ratio_max)) });
  }
  return { global: round4(global), peers: all.length, byCategory };
}

export interface Valuation { ratio: number; momentum: number; drought: number; age_days: number | null; implied: number }

export function value(p: Protocol, asOf: string, ratio: number): Valuation {
  const g = p.change_7d === null ? 0 : clamp(p.change_7d, MODEL.momentum_floor, MODEL.momentum_cap);
  const momentum = 1 + (g / 100) * MODEL.momentum_weight;
  const age = ageDays(asOf, p.listed_at);
  const span = age === null ? 0.5 : Math.min(age, MODEL.drought_days) / MODEL.drought_days;
  const drought = MODEL.drought_min + span * MODEL.drought_range;
  const implied = Math.max(1, Math.round(p.tvl_usd * ratio * momentum * drought));
  return { ratio, momentum: round4(momentum), drought: round4(drought), age_days: age, implied };
}
