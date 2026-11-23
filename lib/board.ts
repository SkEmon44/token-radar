// The board and the dashboard's dataset, built from one snapshot by one model.

import { MODEL, ageDays, hasToken, peerRatios, rankable, value, type Protocol, type Snapshot } from './radar.ts';
import { farmPlan, holdDays, kindOf, stepLine, ticket, type Step } from './farm.ts';

export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null; token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number; peer_ratio: number; momentum_mult: number; drought_mult: number;
  watchlist: boolean; farm_steps: string[];
}

export function parseSnapshot(text: string): Snapshot {
  const s = JSON.parse(text) as Snapshot;
  if (!s || typeof s.as_of !== 'string' || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) {
    throw new Error('snapshot: expected { as_of, protocols[], watchlist[] }');
  }
  return s;
}

const bySlug = (a: { slug: string }, b: { slug: string }): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

export function buildRadar(snapshot: Snapshot) {
  const watch = new Set(snapshot.watchlist);
  const peers = peerRatios(snapshot.protocols);
  const ratioOf = (p: Protocol): number => peers.byCategory.get(p.category ?? 'Uncategorised')!.ratio;
  const plans = new Map<string, Step[]>();
  const scored = snapshot.protocols
    .filter((p) => rankable(p, watch))
    .map((p) => ({ p, v: value(p, snapshot.as_of, ratioOf(p)) }))
    .sort((a, b) => b.v.implied - a.v.implied || bySlug(a.p, b.p));

  const board: BoardRow[] = scored.map(({ p, v }, i) => {
    const plan = farmPlan(p, v.age_days);
    plans.set(p.slug, plan);
    return {
      rank: i + 1, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
      tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd, listed_at: p.listed_at,
      gecko_id: p.gecko_id, symbol: p.symbol, token_status: 'pre-token', age_days: v.age_days,
      implied_value_usd: v.implied, peer_ratio: v.ratio, momentum_mult: v.momentum, drought_mult: v.drought,
      watchlist: watch.has(p.slug), farm_steps: plan.map(stepLine),
    };
  });

  const live = snapshot.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlug(a, b))
    .slice(0, 60)
    .map((p) => ({ slug: p.slug, name: p.name, symbol: p.symbol, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, ratio: Math.round((p.mcap_usd! / p.tvl_usd) * 1e4) / 1e4, age_days: ageDays(snapshot.as_of, p.listed_at) }));

  const radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    model: MODEL,
    global_ratio: peers.global,
    peer_count: peers.peers,
    ratios: [...peers.byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1)),
    counts: { protocols: snapshot.protocols.length, pre_token: snapshot.protocols.filter((p) => !hasToken(p)).length, ranked: board.length, watchlist: watch.size, live: live.length },
    rows: board.map((r) => {
      const p = snapshot.protocols.find((x) => x.slug === r.slug)!;
      return { ...r, farm_steps: undefined, plan: plans.get(r.slug), kind: kindOf(p), ticket: ticket(p), hold_days: holdDays(r.age_days) };
    }),
    live,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'duplicate slugs on the board';
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length) return `the board misses watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${i + 1} has rank ${r.rank}`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

export const dataScript = (radar: unknown): string => `window.RADAR=${JSON.stringify(radar)};\n`;
