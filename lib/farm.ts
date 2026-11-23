// Farm plans: concrete steps for each pre-token protocol, each with what it costs and how long it takes.
// Built from the row's own category, chains, TVL and age; no protocol is named in the rules.

import type { Protocol } from './radar.ts';

export interface Step { text: string; cost: string; time: string }

const GAS: Record<string, [string, number]> = {
  Ethereum: ['~$4-12 per transaction', 8],
  Bitcoin: ['~$1-5 per on-chain transaction', 3],
  Solana: ['under $0.01 per transaction', 0.01],
};
const gasOf = (chain: string): [string, number] => GAS[chain] ?? ['under $0.50 per transaction', 0.3];

type Kind = 'vault' | 'lend' | 'dex' | 'perp' | 'rwa' | 'stake' | 'core';
const KIND: Record<string, Kind> = {
  'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault', Yield: 'vault', 'Yield Aggregator': 'vault',
  'Basis Trading': 'vault', 'Stablecoin Wrapper': 'vault', CeDeFi: 'vault', 'Leveraged Farming': 'vault', Farm: 'vault',
  'Options Vault': 'vault', Indexes: 'vault', 'Governance Incentives': 'vault',
  Lending: 'lend', CDP: 'lend', 'CDP Manager': 'lend', 'Uncollateralized Lending': 'lend', 'Collateral Markets': 'lend', 'Dual-Token Stablecoin': 'lend',
  Dexs: 'dex', 'Liquidity Manager': 'dex', 'OTC Marketplace': 'dex',
  Derivatives: 'perp', 'Prediction Market': 'perp', 'Interest Rate Derivatives': 'perp',
  RWA: 'rwa',
  Restaking: 'stake', 'Staking Pool': 'stake', Chain: 'stake', Payments: 'stake', 'Anchor BTC': 'stake', 'Decentralized BTC': 'stake', Insurance: 'stake',
};
export const kindOf = (p: Protocol): Kind => KIND[p.category ?? ''] ?? 'core';

/** A ticket sized to the protocol: small enough to lose, large enough to rank in a points table. */
export function ticket(p: Protocol): number {
  if (p.tvl_usd >= 1e9) return 5000;
  if (p.tvl_usd >= 2e8) return 2500;
  if (p.tvl_usd >= 5e7) return 1000;
  return 500;
}

/** Days to keep the position: a younger protocol's snapshot window is likelier still ahead. */
export function holdDays(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 120;
  if (age < 540) return 90;
  return 45;
}

const usd = (n: number): string => `$${n.toLocaleString('en-US')}`;

function core(kind: Kind, p: Protocol, t: number, chain: string, gas: string): Step[] {
  const cat = (p.category ?? 'protocol').toLowerCase();
  switch (kind) {
    case 'vault': return [
      { text: `Deposit ${usd(t)} of USDC (or the vault's base asset) into ${p.name}'s largest ${cat} vault on ${chain}; pick the vault with the longest track record, not the highest APY.`, cost: `${gas} for approve + deposit; vault fees usually 0-15% of yield`, time: '15 minutes' },
      { text: `Split a second ${usd(Math.round(t / 2))} into a different strategy or curator vault of ${p.name} so the wallet shows breadth, which points programs often weight.`, cost: gas, time: '10 minutes' },
    ];
    case 'lend': return [
      { text: `Supply ${usd(t)} of a blue-chip asset (ETH, WBTC or USDC) as collateral on ${p.name} on ${chain}.`, cost: `${gas} for approve + supply`, time: '10 minutes' },
      { text: `Borrow against it at no more than 35% LTV and resupply or hold the borrowed stablecoin; usage on both sides of the book is what lending points usually count.`, cost: `${gas} plus the borrow rate (often 3-10% a year)`, time: '10 minutes, then a weekly health-factor check' },
    ];
    case 'dex': return [
      { text: `Provide ${usd(t)} of liquidity to ${p.name}'s deepest stable or blue-chip pool on ${chain}, using a wide range if it is concentrated liquidity.`, cost: `${gas} for approve + add liquidity; impermanent-loss risk on volatile pairs`, time: '20 minutes' },
      { text: `Route a few organic swaps through ${p.name} each week (total ${usd(t)} volume or more) instead of using an aggregator.`, cost: `${gas} per swap plus the pool fee (often 0.01-0.3%)`, time: '5 minutes a week' },
    ];
    case 'perp': return [
      { text: `Deposit ${usd(Math.round(t / 2))} margin on ${p.name} on ${chain} and trade small, hedged or delta-neutral positions at 1-2x leverage to build volume without directional risk.`, cost: `${gas} to deposit; taker fees about 0.03-0.08% of notional`, time: '30 minutes, then 10 minutes a week' },
      { text: `If ${p.name} has a liquidity or market-maker vault, place the rest of the ticket there to earn fees while the volume counter runs.`, cost: gas, time: '10 minutes' },
    ];
    case 'rwa': return [
      { text: `Complete ${p.name}'s onboarding (KYC or accreditation if it asks) and mint or buy ${usd(t)} of its tokenized product on ${chain}.`, cost: `${gas}; issuer fees typically 0.1-0.5% a year`, time: '1-3 days for KYC, then 15 minutes' },
      { text: `Use the tokenized position as collateral or LP where ${p.name} lists integrations, so the wallet shows the asset in use, not idle.`, cost: gas, time: '20 minutes' },
    ];
    case 'stake': return [
      { text: `Stake or delegate ${usd(t)} of the network's asset through ${p.name} on ${chain}, choosing the operator or pool with the best uptime.`, cost: `${gas}; operator commission usually 5-15% of rewards`, time: '20 minutes; unbonding can take days' },
      { text: `Claim and restake rewards every two weeks so the position grows and stays visibly active.`, cost: gas, time: '5 minutes every two weeks' },
    ];
    default: return [
      { text: `Use ${p.name}'s core product on ${chain} with ${usd(t)}: the main action its docs describe (deposit, mint or trade).`, cost: gas, time: '20 minutes' },
      { text: `Repeat a smaller second action each week so the account has a history of use rather than one deposit.`, cost: gas, time: '5 minutes a week' },
    ];
  }
}

export function farmPlan(p: Protocol, age: number | null): Step[] {
  const chain = p.chains[0] ?? 'its main chain';
  const [gas] = gasOf(chain);
  const t = ticket(p);
  const days = holdDays(age);
  const steps: Step[] = [
    { text: `Open ${p.name} from its DefiLlama page, confirm it still records no token, and read its docs for a points, season or rewards programme and its audit reports.`, cost: '$0', time: '30 minutes' },
    { text: `Fund a dedicated wallet on ${chain} with ${usd(t)} plus a gas buffer; bridge with the canonical bridge or a CEX withdrawal straight to ${chain}.`, cost: chain === 'Ethereum' ? 'about $10-25 in gas and withdrawal fees' : 'about $1-5 in bridge and withdrawal fees', time: '15-30 minutes' },
    ...core(kindOf(p), p, t, chain, gas),
    { text: `Hold the position for at least ${days} days and log in weekly to check the points dashboard, TVL and any new quests; ${p.chains.length > 1 ? `repeat a small deposit on ${p.chains[1]} as well, since it runs on ${p.chains.length} chains.` : 'add to it only if TVL keeps growing.'}`, cost: '$0 beyond gas for any top-up', time: `${days} days, 10 minutes a week` },
    { text: `Exit or cut the position by half if TVL falls more than 25% in a week, an exploit is reported, or rewards are announced as finished; never put in more than you could lose.`, cost: `${gas} to withdraw`, time: '10 minutes' },
  ];
  return steps;
}

export const stepLine = (s: Step): string => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
