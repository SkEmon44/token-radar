// Launch Radar dashboard. Reads window.RADAR (data.js, written by main.ts) and renders the ranked board,
// filters, a detail panel that re-derives each implied value from its inputs, the live-token peers the
// model learns its ratios from, and the method. No network; the view state lives in the URL hash.
(function () {
  'use strict';
  var D = window.RADAR, root = document.getElementById('app');
  if (!D || !root) return;
  var M = D.model;
  var S = { tab: 'board', q: '', cat: '', chain: '', kind: '', watch: false, rising: false, min: 0, sort: 'implied_value_usd', dir: -1, sel: D.rows[0] && D.rows[0].slug };
  var KINDS = { vault: 'Vaults & curators', lend: 'Lending & CDP', dex: 'DEX & liquidity', perp: 'Perps & markets', rwa: 'Real-world assets', stake: 'Staking & chains', core: 'Other' };

  function readHash() {
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), k = decodeURIComponent(p[0] || ''), v = decodeURIComponent(p[1] || '');
      if (!(k in S)) return;
      S[k] = typeof S[k] === 'boolean' ? v === '1' : typeof S[k] === 'number' ? Number(v) || 0 : v;
    });
  }
  function writeHash() {
    var parts = [];
    ['tab', 'q', 'cat', 'chain', 'kind', 'min', 'sel'].forEach(function (k) { if (S[k]) parts.push(k + '=' + encodeURIComponent(S[k])); });
    if (S.watch) parts.push('watch=1'); if (S.rising) parts.push('rising=1');
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(d) { return d === null || d === undefined ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function el(tag, a) {
    var n = document.createElement(tag);
    if (a) for (var k in a) {
      if (a[k] === null || a[k] === undefined || a[k] === false) continue;
      if (k === 'class') n.className = a[k]; else if (k === 'text') n.textContent = a[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), a[k]); else n.setAttribute(k, a[k] === true ? '' : a[k]);
    }
    (function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    })([].slice.call(arguments, 2));
    return n;
  }

  // The model in the page: the same arithmetic as lib/radar.ts, so every number can be checked here.
  function derive(r) {
    var g = r.change_7d === null ? 0 : Math.min(M.momentum_cap, Math.max(M.momentum_floor, r.change_7d));
    var mom = 1 + (g / 100) * M.momentum_weight;
    var span = r.age_days === null ? 0.5 : Math.min(r.age_days, M.drought_days) / M.drought_days;
    var dr = M.drought_min + span * M.drought_range;
    return { mom: mom, dr: dr, implied: Math.max(1, Math.round(r.tvl_usd * r.peer_ratio * mom * dr)) };
  }

  var cats = uniq(D.rows.map(function (r) { return r.category || 'Uncategorised'; }));
  var chains = uniq([].concat.apply([], D.rows.map(function (r) { return r.chains.slice(0, 1); })));
  function uniq(xs) { var o = {}; xs.forEach(function (x) { o[x] = (o[x] || 0) + 1; }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a] || (a < b ? -1 : 1); }); }
  var maxImplied = D.rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
  function barW(v) { return Math.max(2, 100 * Math.log10(1 + v) / Math.log10(1 + maxImplied)); }

  function filtered() {
    var q = S.q.toLowerCase();
    return D.rows.filter(function (r) {
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      if (S.cat && (r.category || 'Uncategorised') !== S.cat) return false;
      if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
      if (S.kind && r.kind !== S.kind) return false;
      if (S.watch && !r.watchlist) return false;
      if (S.rising && !(r.change_7d > 0)) return false;
      if (S.min && r.tvl_usd < S.min) return false;
      return true;
    }).sort(function (a, b) {
      var x = a[S.sort], y = b[S.sort];
      if (typeof x === 'string' || typeof y === 'string') { x = String(x || ''); y = String(y || ''); return x < y ? -S.dir : x > y ? S.dir : a.rank - b.rank; }
      x = x === null ? -Infinity : x; y = y === null ? -Infinity : y;
      return x === y ? a.rank - b.rank : (x - y) * S.dir;
    });
  }

  function set(k, v) { S[k] = v; render(); }
  function header() {
    var total = D.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('header', null,
      el('div', null, el('h1', null, 'Launch ', el('span', { text: 'Radar' })),
        el('div', { class: 'sub', text: 'Pre-token DeFi protocols valued at the market-cap/TVL ratio their live-token peers trade at · snapshot ' + D.as_of + ' · ' + D.source })),
      el('div', { class: 'kpis' }, kpi(D.counts.ranked, 'ranked'), kpi(D.counts.watchlist, 'watchlist'), kpi(usd(total), 'implied value'), kpi(D.peer_count, 'live peers')));
  }
  function kpi(v, l) { return el('div', { class: 'kpi' }, el('b', { text: String(v) }), el('small', { text: l })); }
  function tabs() {
    return el('nav', { role: 'tablist' }, [['board', 'Board'], ['peers', 'Live-token peers'], ['method', 'Method']].map(function (t) {
      return el('button', { role: 'tab', 'aria-selected': String(S.tab === t[0]), onclick: function () { set('tab', t[0]); } }, t[1]);
    }));
  }
  function select(label, key, opts, fmt) {
    return el('label', null, label, el('select', { 'aria-label': label, onchange: function (e) { set(key, e.target.value); } },
      el('option', { value: '' }, 'All'), opts.map(function (o) { return el('option', { value: o, selected: S[key] === o }, fmt ? fmt(o) : o); })));
  }
  function filters(n) {
    return el('div', { class: 'filters', role: 'search' },
      el('input', { type: 'search', placeholder: 'Search name, chain, category', value: S.q, 'aria-label': 'Search', oninput: function (e) { S.q = e.target.value; render(true); } }),
      select('Category', 'cat', cats), select('Chain', 'chain', chains), select('Play', 'kind', Object.keys(KINDS), function (k) { return KINDS[k]; }),
      el('label', null, 'Min TVL', el('select', { 'aria-label': 'Minimum TVL', onchange: function (e) { set('min', Number(e.target.value)); } },
        [0, 1e7, 5e7, 1e8, 5e8].map(function (v) { return el('option', { value: v, selected: S.min === v }, v ? usd(v) : 'Any'); }))),
      el('button', { class: 'chip', 'aria-pressed': String(S.watch), onclick: function () { set('watch', !S.watch); } }, 'Watchlist only'),
      el('button', { class: 'chip', 'aria-pressed': String(S.rising), onclick: function () { set('rising', !S.rising); } }, 'TVL rising 7d'),
      el('span', { class: 'count', id: 'count', text: n + ' of ' + D.rows.length + ' protocols' }));
  }
  var COLS = [['rank', '#', 1], ['name', 'Protocol', 0], ['category', 'Category', 0], ['tvl_usd', 'TVL', 1], ['change_7d', '7d', 1], ['age_days', 'No token', 1], ['peer_ratio', 'Peer ×', 1], ['implied_value_usd', 'Implied', 1]];
  function table(rows) {
    if (!rows.length) return el('div', { class: 'empty', text: 'No protocol matches these filters.' });
    return el('table', { 'aria-label': 'Ranked pre-token protocols' },
      el('thead', null, el('tr', null, COLS.map(function (c) {
        return el('th', { class: c[2] ? 'num' : null, scope: 'col', 'aria-sort': S.sort === c[0] ? (S.dir < 0 ? 'descending' : 'ascending') : null, tabindex: 0,
          onclick: function () { if (S.sort === c[0]) S.dir = -S.dir; else { S.sort = c[0]; S.dir = c[2] && c[0] !== 'rank' ? -1 : 1; } render(); } }, c[1]);
      }))),
      el('tbody', null, rows.map(function (r) {
        return el('tr', { class: r.slug === S.sel ? 'sel' : null, tabindex: 0, onclick: function () { set('sel', r.slug); }, onkeydown: function (e) { if (e.key === 'Enter') set('sel', r.slug); } },
          el('td', { class: 'num rank', text: r.rank }),
          el('td', { class: 'name' }, el('b', { text: r.name }), el('small', { text: r.chains[0] || '' }), r.watchlist ? el('span', { class: 'tag w', text: 'watch' }) : null),
          el('td', { class: 'mute cat', title: r.category, text: r.category || '—' }),
          el('td', { class: 'num', text: usd(r.tvl_usd) }),
          el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'mute'), text: pct(r.change_7d) }),
          el('td', { class: 'num', text: age(r.age_days) }),
          el('td', { class: 'num mute', text: r.peer_ratio.toFixed(3) + '×' }),
          el('td', { class: 'num' }, el('span', { class: 'bar' }, el('i', { style: 'width:' + barW(r.implied_value_usd).toFixed(1) + '%' })), el('b', { text: usd(r.implied_value_usd) })));
      })));
  }
  function detail() {
    var r = D.rows.find(function (x) { return x.slug === S.sel; });
    if (!r) return el('aside', null, el('p', { class: 'mute', text: 'Pick a protocol to see how it is valued and how to farm it.' }));
    var d = derive(r), ratio = D.ratios.find(function (x) { return x.category === (r.category || 'Uncategorised'); }) || {};
    var steps = [['TVL', r.tvl_usd, ''], ['× peer ratio ' + r.peer_ratio.toFixed(3), r.tvl_usd * r.peer_ratio, ''], ['× momentum ' + d.mom.toFixed(3), r.tvl_usd * r.peer_ratio * d.mom, ''], ['× drought ' + d.dr.toFixed(3), d.implied, 'r']];
    var top = Math.max.apply(null, steps.map(function (s) { return s[1]; }));
    return el('aside', { 'aria-label': 'Protocol detail' },
      el('div', { class: 'mute', text: '#' + r.rank + ' of ' + D.rows.length + (r.watchlist ? ' · on the watchlist' : '') }),
      el('h2', { text: r.name }),
      el('div', { class: 'mute', text: (r.category || 'Uncategorised') + ' · ' + r.chains.slice(0, 4).join(', ') + (r.chains.length > 4 ? ' +' + (r.chains.length - 4) : '') }),
      el('div', { class: 'big', text: usd(r.implied_value_usd) }),
      el('div', { class: 'mute', text: 'implied fully diluted value if it launched a token on this record' }),
      el('h3', { text: 'How the value is built' }),
      el('div', { class: 'wf' }, steps.map(function (s) { return [el('span', { text: s[0] }), el('div', { class: 'b ' + s[2], style: 'width:' + Math.max(2, 100 * s[1] / top).toFixed(1) + '%' }), el('span', { class: 'num', text: usd(s[1]) })]; })),
      el('div', { class: 'check' + (d.implied === r.implied_value_usd ? ' ok' : ''), text: d.implied === r.implied_value_usd ? '✓ re-derived in the page: matches board.json' : '✗ page gives ' + usd(d.implied) + ', board.json ' + usd(r.implied_value_usd) }),
      el('h3', { text: 'Inputs' }),
      el('div', { class: 'facts' },
        el('div', null, el('span', { text: 'TVL ' }), usd(r.tvl_usd)), el('div', null, el('span', { text: '7d change ' }), pct(r.change_7d)),
        el('div', null, el('span', { text: 'Listed ' }), r.listed_at || 'unknown'), el('div', null, el('span', { text: 'No token for ' }), age(r.age_days)),
        el('div', null, el('span', { text: 'Category peers ' }), String(ratio.peers || 0)), el('div', null, el('span', { text: 'Peer median ' }), ratio.median ? ratio.median.toFixed(3) + '×' : 'none, uses all')),
      el('h3', { text: 'Farm plan · ' + usd(r.ticket) + ' ticket · hold ' + r.hold_days + ' days' }),
      el('ol', { class: 'plan' }, r.plan.map(function (s) { return el('li', null, s.text, el('span', { class: 'meta' }, el('b', { text: 'Cost ' }), s.cost, ' · ', el('b', { text: 'Time ' }), s.time)); })));
  }
  function peers() {
    return el('div', { class: 'card scroll' }, el('table', { 'aria-label': 'Live-token peers' },
      el('thead', null, el('tr', null, ['Protocol', 'Symbol', 'Category', 'TVL', 'Market cap', 'Mcap / TVL', 'Age'].map(function (h, i) { return el('th', { class: i > 2 ? 'num' : null, text: h }); }))),
      el('tbody', null, D.live.map(function (p) {
        return el('tr', null, el('td', { class: 'name' }, el('b', { text: p.name })), el('td', { class: 'mute', text: p.symbol || '—' }), el('td', { class: 'mute', text: p.category || '—' }),
          el('td', { class: 'num', text: usd(p.tvl_usd) }), el('td', { class: 'num', text: usd(p.mcap_usd) }), el('td', { class: 'num', text: p.ratio.toFixed(3) + '×' }), el('td', { class: 'num', text: age(p.age_days) }));
      }))));
  }
  function method() {
    var shown = D.ratios.filter(function (r) { return r.peers > 0; }).slice(0, 18), top = Math.max.apply(null, shown.map(function (r) { return r.ratio; }));
    return el('div', { class: 'card method' },
      el('h2', { text: 'How the radar values a protocol that has no token' }),
      el('p', null, el('code', { text: 'implied = TVL × peer_ratio(category) × momentum(7d) × drought(age)' })),
      el('p', { text: 'Peer ratio: the median market cap / TVL of the ' + D.peer_count + ' protocols in this same snapshot whose token already trades, by category. Each peer is clamped to ' + M.peer_min + '–' + M.peer_max + '× and the category median is blended in log space with the all-category median (' + D.global_ratio + '×) at a weight of ' + M.shrink + ' pseudo-peers, so a category with one odd peer stays near the market. Final ratios are clamped to ' + M.ratio_min + '–' + M.ratio_max + '×.' }),
      el('p', { text: 'Momentum: 1 + clamp(7d TVL change, ' + M.momentum_floor + '%, +' + M.momentum_cap + '%) × ' + M.momentum_weight + '. Drought: ' + M.drought_min + ' + ' + M.drought_range + ' × min(days listed without a token, ' + M.drought_days + ') / ' + M.drought_days + '; unknown age takes the midpoint. Wrapped, bridged, liquid-staking and exchange products are left out unless the watchlist names them.' }),
      el('h3', { text: 'Ratios learned from live tokens (categories with peers)' }),
      el('div', { class: 'hbar' }, shown.map(function (r) { return [el('span', { text: r.category }), el('div', { class: 'b', style: 'width:' + (100 * r.ratio / top).toFixed(1) + '%' }), el('span', { class: 'num', text: r.ratio.toFixed(3) + '×' }), el('span', { class: 'mute', text: r.peers + ' peers' })]; })));
  }

  function render(keepFocus) {
    var rows = filtered();
    if (keepFocus && S.tab === 'board') {
      var holder = document.getElementById('tablebox'); holder.textContent = ''; holder.appendChild(table(rows));
      document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' protocols';
      writeHash(); return;
    }
    root.textContent = '';
    root.appendChild(header()); root.appendChild(tabs());
    var body = S.tab === 'board'
      ? el('div', { class: 'wrap' }, el('div', { class: 'card' }, filters(rows.length), el('div', { class: 'scroll', id: 'tablebox' }, table(rows))), detail())
      : el('div', { class: 'wrap full' }, S.tab === 'peers' ? peers() : method());
    root.appendChild(body);
    root.setAttribute('aria-busy', 'false');
    writeHash();
  }
  readHash();
  render();
})();
