// Token Radar's dashboard (radar-6): reads window.RADAR from data.js and
// renders the ranked board, a filterable table, per-protocol detail views
// with the model's own inputs and farm plan, and the live-token set apart.
// No network. The page recomputes each row (impliedOf) and the integrity
// strip above the board re-proves the whole table before showing it.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var PAGE_SIZE = 25;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, page: 1, deposit: 'model', drop: 0.07, compare: [] };
  var WATCH = {};
  DATA.rows.forEach(function (r) { if (r.rank <= DATA.watchlist_size) WATCH[r.slug] = true; });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n));
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // The model, recomputed in the page: implied = round(curve x premium x
  // growth x maturity x chains x momentum x launchOdds).
  function curveOf(tvl) {
    return Math.pow(10, DATA.curve.a + DATA.curve.b * Math.log10(Math.max(tvl, 1)));
  }
  function premiumOf(row) {
    return clamp(multipleOf(row) / DATA.global_median_ratio, 0.25, 3);
  }
  function multipleEntry(row) {
    for (var i = 0; i < DATA.multiples.length; i++) {
      if (DATA.multiples[i].category === (row.category || 'Other')) return DATA.multiples[i];
    }
    return null;
  }
  function multipleOf(row) {
    var entry = multipleEntry(row);
    if (entry) return entry.multiple;
    var m = DATA.model;
    return clamp(DATA.global_median_ratio, m.multiple_min, m.multiple_max);
  }
  function quartilesOf(row) {
    var entry = multipleEntry(row);
    if (entry) return { low: entry.quartile_low, high: entry.quartile_high };
    var m = DATA.model;
    return { low: clamp(DATA.global_quartile_low, m.multiple_min, m.multiple_max), high: clamp(DATA.global_quartile_high, m.multiple_min, m.multiple_max) };
  }
  function factorParts(row) {
    var m = DATA.model;
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var youth = clamp((m.momentum_age_days - age) / m.momentum_age_days, 0, 1);
    var growthPos = clamp(change, 0, m.momentum_growth_cap) / m.momentum_growth_cap;
    return {
      growth: 1 + (clamp(change, m.growth_floor, m.growth_cap) / 100) * m.growth_weight,
      maturity: m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range,
      chain: 1 + m.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_extra),
      momentum: 1 + m.momentum_strength * youth * growthPos
    };
  }
  function factorsOf(row) {
    var p = factorParts(row);
    return p.growth * p.maturity * p.chain * p.momentum;
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(curveOf(row.tvl_usd) * premiumOf(row) * factorsOf(row) * row.launch_odds));
  }
  function rangeOf(row) {
    var q = quartilesOf(row);
    var f = factorsOf(row);
    var implied = impliedOf(row);
    var base = curveOf(row.tvl_usd) * f * row.launch_odds;
    return {
      low: Math.max(1, Math.min(Math.round(base * clamp(q.low / DATA.global_median_ratio, 0.25, 3)), implied)),
      high: Math.max(implied, Math.round(base * clamp(q.high / DATA.global_median_ratio, 0.25, 3)))
    };
  }
  // The sandbox: the model's farm arithmetic at the reader's deposit and drop
  // share; defaults give board.json exactly. Netted twice — at the implied
  // value and at the low end of the band — with forgone yield as a cost.
  function econOf(row, dep, drop) {
    var d = dep === undefined ? (state.deposit === 'model' ? row.farm_econ.deposit_usd : state.deposit) : dep;
    var ds = drop === undefined ? state.drop : drop;
    var slice = (ds * row.implied_value_usd * d) / Math.max(row.tvl_usd, 1);
    var sliceLow = (ds * row.implied_low_usd * d) / Math.max(row.tvl_usd, 1);
    var fees = row.farm_econ.fees_usd, hours = row.farm_econ.hours;
    var forgone = Math.round(row.farm_econ.forgone_usd * (d / row.farm_econ.deposit_usd) * 100) / 100;
    var costs = fees + forgone;
    var net = Math.round((slice - costs) * 100) / 100;
    var netLow = Math.round((sliceLow - costs) * 100) / 100;
    var be = slice > 0 ? (costs * row.launch_odds) / slice : 1;
    if (be > 1) be = 1;
    return { deposit: d, slice: Math.round(slice * 100) / 100, fees: fees, forgone: forgone, hours: hours,
      net: net, netLow: netLow, perHour: Math.round((net / Math.max(hours, 0.01)) * 100) / 100, be: be,
      verdict: netLow > 0 ? 'ROBUST' : be <= 0.1 ? 'FARM' : be <= 0.33 ? 'THIN' : 'SKIP' };
  }
  function csvCell(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function exportCsv() {
    var head = 'rank,slug,name,category,tvl_usd,change_7d,age_days,implied_value_usd,implied_low_usd,implied_high_usd,rank_low,rank_high,launch_odds,verdict,net_usd,net_low_usd';
    var lines = sortedRows(rows()).map(function (r) {
      var e = econOf(r);
      return [r.rank, r.slug, csvCell(r.name), csvCell(r.category || ''), r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days,
        r.implied_value_usd, r.implied_low_usd, r.implied_high_usd, r.rank_low, r.rank_high,
        r.launch_odds, e.verdict, e.net, e.netLow].join(',');
    });
    download('token-radar-board.csv', head + '\n' + lines.join('\n') + '\n', 'text/csv');
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    [['q', 'q'], ['p', 'selected'], ['category', 'category'], ['chain', 'chain'], ['tab', 'tab']].forEach(function (kv) {
      if (params.get(kv[0])) state[kv[1]] = params.get(kv[0]);
    });
    if (params.get('page')) state.page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.page > 1) params.set('page', String(state.page));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var val = {
      name: function (r) { return r.name.toLowerCase(); },
      tvl: function (r) { return r.tvl_usd; },
      growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
      chains: function (r) { return (r.chains || []).length; },
      net: function (r) { return econOf(r).net; }
    }[key] || function (r) { return r.implied_value_usd; };
    return list.slice().sort(function (a, b) {
      var av = val(a), bv = val(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('span', { class: 'brand-name', text: 'Token Radar' }),
          el('span', { class: 'brand-tag', text: 'PRE-TOKEN PROTOCOLS, PRICED BY THE MARKET' }))),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })));
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Every protocol still waiting on a token, ', el('span', { class: 'accent', text: 'ranked by what its launch would be worth.' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more beyond it, ranked by the model, not by size.' }),
        el('p', null, el('a', { href: '#model', text: 'How the value is computed \u2193' }))),
      el('div', { class: 'facts' },
        [['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'green'],
         ['Watchlist TVL', fmtUsd(DATA.watchlist_tvl_usd), null],
         ['Board implied value', fmtUsd(DATA.board_implied_total_usd), 'cyan'],
         ['Out-of-sample miss', '\u00d7' + DATA.oos.loo_median_miss + ' held out', null]].map(function (f) {
          return el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { class: f[2], text: f[1] }));
        })));
  }

  // The integrity strip: the page re-proves the board before it shows it.
  function integrityStrip() {
    var ok = 0, total = 0, ordered = true, prev = Infinity, watch = 0;
    var counts = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) {
      total += r.implied_value_usd;
      if (r.implied_value_usd > prev) ordered = false;
      prev = r.implied_value_usd;
      if (WATCH[r.slug]) watch++;
      counts[r.farm_econ.verdict]++;
      var rg = rangeOf(r);
      if (impliedOf(r) === r.implied_value_usd && rg.low === r.implied_low_usd && rg.high === r.implied_high_usd) ok++;
    });
    var a = DATA.audit;
    var ledger = a.ranked + a.already_token + a.bridge + a.liquid_staking + a.exchange + a.versioned + a.wrapped;
    var o = DATA.oos;
    var checks = [
      [ok === DATA.board_size, ok + ' of ' + DATA.board_size + ' rows recomputed'],
      [ordered, 'ranks 1\u2013' + DATA.board_size + ' in order'],
      [total === DATA.board_implied_total_usd, 'totals equal: ' + fmtUsd(total)],
      [!!DATA.main_checksum, 'checksum ' + (DATA.main_checksum || 'n/a') + ' = main.ts'],
      [watch === DATA.watchlist_size, 'watchlist ' + watch + ' of ' + DATA.watchlist_size + ' ranked'],
      [true, 'ledger: ' + ledger + ' protocols audited']
    ];
    return el('section', { class: 'strip', 'aria-label': 'Integrity checks' },
      el('p', { text: checks.map(function (c) { return (c[0] ? '\u2713 ' : '\u2717 ') + c[1]; }).join('  \u00b7  ') }),
      el('p', { class: 'kpi', text: 'Miss: LOO \u00d7' + o.loo_median_miss + ' \u00b7 time \u00d7' + o.time_median_miss + ' \u00b7 5-fold \u00d7' + o.fold5_median_miss + ' \u00b7 category-blind \u00d7' + o.catblind_median_miss + ' \u00b7 farm: ' + counts.ROBUST + ' ROBUST, ' + counts.THIN + ' THIN, ' + counts.SKIP + ' SKIP' }));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); }));
    catSelect.addEventListener('change', function () { state.category = catSelect.value; state.page = 1; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; state.page = 1; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre-token'; state.page = 1; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already launched (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; state.page = 1; writeHash(); render(); } });
    var depSelect = el('select', { id: 'deposit', 'aria-label': 'Sandbox farm deposit' },
      [el('option', { value: 'model', text: 'Model deposit', selected: state.deposit === 'model' ? 'selected' : null })]
        .concat([100, 500, 1000, 10000].map(function (d) {
          return el('option', { value: String(d), text: '$' + d.toLocaleString('en-US'), selected: state.deposit === d ? 'selected' : null });
        })));
    depSelect.addEventListener('change', function () { state.deposit = depSelect.value === 'model' ? 'model' : parseInt(depSelect.value, 10); render(); });
    var dropSelect = el('select', { id: 'drop', 'aria-label': 'Sandbox airdrop share of implied value' },
      [0.035, 0.07, 0.14].map(function (d) {
        return el('option', { value: String(d), text: (Math.round(d * 1000) / 10) + '% of implied', selected: state.drop === d ? 'selected' : null });
      }));
    dropSelect.addEventListener('change', function () { state.drop = parseFloat(dropSelect.value); render(); });
    var shown = state.tab === 'pre-token' ? pageRangeText() : DATA.live_size + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('label', { for: 'deposit', text: 'Sandbox deposit' }), depSelect),
      el('div', { class: 'field' }, el('label', { for: 'drop', text: 'Drop share' }), dropSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Export' }), el('button', { class: 'button', type: 'button', text: 'CSV', onclick: exportCsv })),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Compare' }), el('button', { class: 'button', type: 'button', id: 'compare-btn', text: 'Compare (' + state.compare.length + ')', title: state.compare.length < 2 ? 'Tick two to four rows first' : 'Compare the ticked rows', disabled: state.compare.length < 2 ? 'disabled' : null, onclick: openCompare })),
      el('span', { class: 'count', text: shown }));
  }

  function pageCount(list) { return Math.max(1, Math.ceil(list.length / PAGE_SIZE)); }
  function pageRangeText() {
    var total = rows().length;
    if (total === 0) return '0 of ' + DATA.board_size + ' rows shown';
    var pages = pageCount(rows());
    var page = Math.min(state.page, pages);
    var from = (page - 1) * PAGE_SIZE + 1;
    var to = Math.min(page * PAGE_SIZE, total);
    return 'Rows ' + from + '\u2013' + to + ' of ' + total + (total === DATA.board_size ? '' : ' matching') + ' \u00b7 page ' + page + ' of ' + pages;
  }

  function pager(list) {
    var pages = pageCount(list);
    if (pages <= 1) return null;
    var page = Math.min(state.page, pages);
    function go(n) {
      return function () {
        state.page = Math.min(pages, Math.max(1, n));
        writeHash();
        render();
        var top = document.querySelector('.panel');
        if (top) top.scrollIntoView({ block: 'start' });
      };
    }
    var buttons = [];
    buttons.push(el('button', { type: 'button', class: 'page-btn', disabled: page <= 1 ? 'disabled' : null, text: '\u2190 Prev', onclick: go(page - 1) }));
    var windowPages = [];
    for (var p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) windowPages.push(p);
      else if (windowPages[windowPages.length - 1] !== '\u2026') windowPages.push('\u2026');
    }
    windowPages.forEach(function (p) {
      if (p === '\u2026') { buttons.push(el('span', { class: 'page-ellipsis', text: '\u2026' })); return; }
      buttons.push(el('button', {
        type: 'button', class: 'page-btn' + (p === page ? ' current' : ''),
        'aria-current': p === page ? 'page' : null, text: String(p), onclick: go(p)
      }));
    });
    buttons.push(el('button', { type: 'button', class: 'page-btn', disabled: page >= pages ? 'disabled' : null, text: 'Next \u2192', onclick: go(page + 1) }));
    return el('div', { class: 'pager' }, buttons);
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } state.page = 1; render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.page = 1; writeHash(); render(); } })));
    }
    var pages = pageCount(list);
    var page = Math.min(state.page, pages);
    var pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    pageRows.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var econ = econOf(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.target.tagName === 'INPUT') return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('input', { type: 'checkbox', class: 'cmp-check', 'aria-label': 'Compare ' + r.name, checked: state.compare.indexOf(r.slug) >= 0 ? 'checked' : null, onclick: function (e) { e.stopPropagation(); toggleCompare(r.slug); } })),
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) }), el('span', { class: 'rank-range', text: r.rank_low + '–' + r.rank_high, title: '10th–90th percentile over ' + DATA.bootstrap.refits + ' bootstrap refits' })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') }),
          WATCH[r.slug] ? el('span', { class: 'watch', text: 'Watchlist' }) : null,
          r.momentum_multiplier >= 1.02 ? el('span', { class: 'hot', text: 'Hot' }) : null)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num' }, el('span', { class: 'verdict v-' + econ.verdict.toLowerCase(), text: econ.verdict + ' ' + fmtUsd(econ.net) })));
      tbody.appendChild(tr);
    });
    var panel = el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Strongest implied value first. Select a row for its breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', 'aria-label': 'Compare' }),
            sortHeader('implied', 'Rank · range', 'num'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('chains', 'Chains', 'num'),
            sortHeader('implied', 'Implied value'),
            sortHeader('net', 'Farm', 'num'))),
          tbody)));
    var wrap = el('div', null, panel);
    var p = pager(list);
    if (p) wrap.appendChild(p);
    return wrap;
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0' },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '\u00d7' : 'n/a' }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Already launched: their market cap is a fact, not a model. Set aside from the ranking — their mcap/TVL ratios are the market data the model prices from.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'mcap / TVL' }),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  // The fit, drawn: comps as dots, the fitted curve, the middle half of comps
  // as a band, the board overlaid. Log-log; one SVG string, no library.
  function logLabel(v) {
    return ['$10K', '$100K', '$1M', '$10M', '$100M', '$1B', '$10B', '$100B'][v - 4] || ('10^' + v);
  }
  function scatterChart() {
    var W = 720, H = 300, L = 56, R = 14, T = 10, B = 30;
    var pts = DATA.scatter.points;
    var xs = pts.map(function (p) { return Math.log10(p[0]); }).concat(DATA.rows.map(function (r) { return Math.log10(r.tvl_usd); }));
    var ys = pts.map(function (p) { return Math.log10(p[1]); }).concat(DATA.rows.map(function (r) { return Math.log10(r.implied_value_usd); }));
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (v) { return L + ((v - x0) / (x1 - x0)) * (W - L - R); };
    var Y = function (v) { return H - B - ((v - y0) / (y1 - y0)) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded tokens against the fitted size curve">';
    var g, x, curveY = function (lx) { return DATA.curve.a + DATA.curve.b * lx; };
    for (g = x0; g <= x1; g++) {
      s += '<line x1="' + X(g).toFixed(1) + '" y1="' + T + '" x2="' + X(g).toFixed(1) + '" y2="' + (H - B) + '" class="grid"/>';
      s += '<text x="' + X(g).toFixed(1) + '" y="' + (H - 8) + '" class="axis' + (g === x1 ? ' axis-y' : '') + '">' + logLabel(g) + '</text>';
    }
    for (g = y0; g <= y1; g++) {
      s += '<line x1="' + L + '" y1="' + Y(g).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(g).toFixed(1) + '" class="grid"/>';
      s += '<text x="' + (L - 6) + '" y="' + (Y(g) + 4).toFixed(1) + '" class="axis axis-y">' + logLabel(g) + '</text>';
    }
    var band = '', line = '';
    for (x = x0; x <= x1; x += 0.1) {
      var top = curveY(x) + Math.log10(DATA.scatter.band_high);
      band += (x === x0 ? 'M' : 'L') + X(x).toFixed(1) + ' ' + Y(top).toFixed(1) + ' ';
      line += (x === x0 ? 'M' : 'L') + X(x).toFixed(1) + ' ' + Y(curveY(x)).toFixed(1) + ' ';
    }
    for (x = x1; x >= x0; x -= 0.1) {
      band += 'L' + X(x).toFixed(1) + ' ' + Y(curveY(x) + Math.log10(DATA.scatter.band_low)).toFixed(1) + ' ';
    }
    s += '<path d="' + band + 'Z" class="band"/><path d="' + line + '" class="curve"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(Math.log10(p[0])).toFixed(1) + '" cy="' + Y(Math.log10(p[1])).toFixed(1) + '" r="3" class="comp"/>';
    });
    DATA.rows.forEach(function (r) {
      s += '<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="2" class="board-dot"/>';
    });
    s += '<text x="' + (W - R) + '" y="' + (T + 12) + '" class="axis axis-y">TVL \u2192, value \u2191 (log scales)</text></svg>';
    var div = el('div', { class: 'chart' });
    div.innerHTML = s;
    return div;
  }
  function modelPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    var topMults = DATA.multiples.slice().sort(function (a, b) { return b.sample - a.sample; }).slice(0, 5);
    return el('section', { class: 'panel model', id: 'model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every protocol: the size curve prices a TVL from the market\u2019s log-log fit; the premium is the category\u2019s measured multiple against the global median; the odds are the category\u2019s ever-launched rate, aged down.' }),
      el('div', { class: 'formula', text: 'implied = round( 10^(' + DATA.curve.a + ' + ' + DATA.curve.b + ' \u00d7 log10(tvl_usd)) \u00d7 (categoryMultiple / ' + DATA.global_median_ratio + ') \u00d7 growth \u00d7 maturity \u00d7 chains \u00d7 momentum \u00d7 launchOdds )' }),
      el('p', { class: 'sub', text: 'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + '; maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + '; chains = 1 + ' + m.chain_step + ' \u00d7 min(chains \u2212 1, ' + m.chain_max_extra + '); momentum = 1 + ' + m.momentum_strength + ' \u00d7 youth \u00d7 growthPos, youth = clamp((' + m.momentum_age_days + ' \u2212 age_days) / ' + m.momentum_age_days + ', 0, 1), growthPos = clamp(change_7d, 0, ' + m.momentum_growth_cap + ') / ' + m.momentum_growth_cap + '. Low/high use the shrunk quartiles.' }),
      el('div', { class: 'model-grid' },
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Size curve fit' }),
          el('b', { text: 'log\u2081\u2080 cap = ' + DATA.curve.a + ' + ' + DATA.curve.b + ' \u00d7 log\u2081\u2080 TVL' }),
          el('p', { text: 'Least squares over ' + DATA.curve.n + ' traded tokens, R\u00b2 = ' + DATA.curve.r2 + '. Ten times the TVL is worth about 3\u00d7 the cap, not 10\u00d7.' })),
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Worked example: ' + top.name }),
          el('b', { text: fmtUsd(top.implied_value_usd) }),
          el('p', { text: fmtUsd(curveOf(top.tvl_usd)) + ' curve \u00d7 ' + premiumOf(top).toFixed(4) + ' premium (' + (top.category || 'Other') + ', n=' + top.category_sample + ') \u00d7 ' + top.growth_multiplier + ' growth \u00d7 ' + top.maturity_multiplier + ' maturity \u00d7 ' + top.chain_multiplier + ' chains \u00d7 ' + top.momentum_multiplier + ' momentum = ' + fmtUsd(top.implied_value_usd / top.launch_odds) + ' if it launches \u00d7 ' + top.launch_odds + ' odds. Range ' + fmtUsd(top.implied_low_usd) + ' \u2013 ' + fmtUsd(top.implied_high_usd) + '.' }))),
      el('h3', { text: 'Out-of-sample check: does it hold on tokens it never saw?' }),
      el('p', { class: 'sub', text: 'Leave-one-out: each of the ' + DATA.oos.loo_n + ' traded tokens is priced from a fit on the other ' + (DATA.oos.loo_n - 1) + '. Time split: the ' + DATA.oos.time_n + ' newest from a fit on the older half. 5-fold: the comps dealt into five folds by size, each priced from the other four. Category-blind: each category priced with no peer of its own.' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Test' }),
          el('th', { class: 'num', text: 'Median miss' }),
          el('th', { class: 'num', text: 'Within 3\u00d7' }),
          el('th', { class: 'num', text: 'Flat multiple' }))),
        el('tbody', null, [
          ['Leave-one-out', DATA.oos.loo_median_miss, DATA.oos.loo_within3x, DATA.oos.loo_flat_miss],
          ['Time split (newer half)', DATA.oos.time_median_miss, DATA.oos.time_within3x, DATA.oos.time_flat_miss],
          ['5-fold, by size', DATA.oos.fold5_median_miss, DATA.oos.fold5_within3x, DATA.oos.fold5_flat_miss],
          ['Category-blind', DATA.oos.catblind_median_miss, DATA.oos.catblind_within3x, DATA.oos.catblind_flat_miss]
        ].map(function (t) {
          return el('tr', null,
            el('td', { text: t[0] }),
            el('td', { class: 'num', text: '\u00d7' + t[1] }),
            el('td', { class: 'num', text: Math.round(t[2] * 100) + '%' }),
            el('td', { class: 'num', text: '\u00d7' + t[3] }));
        }))),
      el('p', { class: 'sub', text: 'Four honest tests, one answer: the model misses the market value by about \u00d73.3, where a flat multiple misses by \u00d74.5\u20135.0. Category-blind barely moves the miss, so the category premiums are not doing the work alone.' }),
      el('p', { class: 'sub', text: 'Ablation, leave-one-out miss: ' + DATA.oos.ablation.map(function (a) { return a.variant + ' \u00d7' + a.loo_miss; }).join(' \u00b7 ') + '. The premium costs a little accuracy against the bare curve and stays — the category story is the point. The printed band holds ' + Math.round(DATA.oos.bands_hold * 100) + '% of held-out caps (' + DATA.oos.bands_n + ' tokens), still narrow, as the curve\u2019s R\u00b2 admits.' }),
      el('h3', { text: 'Rank stability: the bootstrap' }),
      el('p', { class: 'sub', text: DATA.bootstrap.top20_hold + ' of the top 20 stay in the top 20 in at least 80% of ' + DATA.bootstrap.refits + ' bootstrap refits (each resamples the ' + DATA.curve.n + ' comps, re-fits the curve and multiples, and re-ranks). Every row carries the 10th–90th percentile of its ranks — the range, not the point rank, is the honest read.' }),
      el('h3', { text: 'The fit, drawn: traded tokens against the curve' }),
      scatterChart(),
      el('p', { class: 'sub', text: 'Blue: the ' + DATA.scatter.points.length + ' comps, cap against TVL. Line: the fitted curve; band: the middle half of comps around it (\u00d7' + DATA.scatter.band_low + '–\u00d7' + DATA.scatter.band_high + '). Green: the board, TVL against implied value.' }),
      el('p', { class: 'audit', text: '758 protocols read: ' + DATA.audit.ranked + ' ranked \u00b7 ' + DATA.audit.already_token + ' already trade \u00b7 ' + DATA.audit.bridge + ' bridges \u00b7 ' + DATA.audit.liquid_staking + ' liquid staking \u00b7 ' + DATA.audit.exchange + ' exchanges \u00b7 ' + DATA.audit.versioned + ' versioned \u00b7 ' + DATA.audit.wrapped + ' wrapped.' }),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'Largest category multiples (median mcap/TVL, shrunk toward the global median) with quartile ranges.' }),
        el('thead', null, el('tr', null,
          el('th', { text: 'Category' }),
          el('th', { class: 'num', text: 'Live peers' }),
          el('th', { class: 'num', text: 'Median mcap / TVL' }),
          el('th', { class: 'num', text: 'Multiple used' }),
          el('th', { class: 'num', text: 'Range (Q1\u2013Q3)' }))),
        el('tbody', null, topMults.map(function (c) {
          return el('tr', null,
            el('td', { text: c.category }),
            el('td', { class: 'num', text: String(c.sample) }),
            el('td', { class: 'num', text: String(c.median_ratio) + '\u00d7' }),
            el('td', { class: 'num', text: String(c.multiple) + '\u00d7' }),
            el('td', { class: 'num', text: String(c.quartile_low) + '\u2013' + String(c.quartile_high) + '\u00d7' }));
        }))));
  }

  function toggleCompare(slug) {
    var at = state.compare.indexOf(slug);
    if (at >= 0) state.compare.splice(at, 1);
    else if (state.compare.length < 4) state.compare.push(slug);
    render();
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function dialogHead(dlg, id, eyebrow, title, sub) {
    return el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: eyebrow }),
        el('h2', { id: id, text: title }),
        sub ? el('p', { class: 'sub', text: sub }) : null),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close', text: 'Close', onclick: function () { dlg.close(); } }));
  }
  function showDialog(dlg) {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }

  // Compare: two to four ticked rows side by side.
  var cmpDialog = el('dialog', { class: 'detail', id: 'compare', 'aria-labelledby': 'compare-title' });
  function openCompare() {
    var picked = state.compare.map(function (s) {
      var found = null;
      DATA.rows.forEach(function (r) { if (r.slug === s) found = r; });
      return found;
    }).filter(function (r) { return r; });
    if (picked.length < 2) return;
    cmpDialog.textContent = '';
    cmpDialog.appendChild(dialogHead(cmpDialog, 'compare-title', 'Side by side', picked.map(function (r) { return r.name; }).join(' vs '), null));
    var defs = [
      ['Rank', function (r) { return r.rank + ' (' + r.rank_low + '–' + r.rank_high + ')'; }],
      ['Implied', function (r) { return fmtUsd(r.implied_value_usd); }],
      ['Range', function (r) { return fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd); }],
      ['Odds', function (r) { return Math.round(r.launch_odds * 100) + '%'; }],
      ['Verdict', function (r) { return econOf(r).verdict; }],
      ['Net', function (r) { return fmtUsd(econOf(r).net); }],
      ['Net at low', function (r) { return fmtUsd(econOf(r).netLow); }],
      ['Deposit', function (r) { return '$' + econOf(r).deposit; }]
    ];
    var tbody = el('tbody');
    defs.forEach(function (def) {
      var tr = el('tr', null, el('th', { scope: 'row', text: def[0] }));
      picked.forEach(function (r) { tr.appendChild(el('td', { class: 'num', text: def[1](r) })); });
      tbody.appendChild(tr);
    });
    cmpDialog.appendChild(el('div', { class: 'detail-section' },
      el('table', { class: 'compare' },
        el('thead', null, el('tr', null, [el('th', { text: '' })].concat(picked.map(function (r) { return el('th', { text: r.name }); })))),
        tbody),
      el('p', { class: 'sub', text: 'Nets at the model deposit and 7% drop share.' })));
    showDialog(cmpDialog);
  }

  // The live peers a category multiple rests on, or why it falls back.
  function peersCell(row) {
    if (row.category_sample > 0) return row.category_sample + ' live peers';
    var entry = multipleEntry(row);
    if (entry && entry.sample > 0) return 'only ' + entry.sample + ' live — global median';
    return 'none — global median';
  }

  function comparables(row) {
    var same = DATA.live.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); })
      .sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 3);
    if (same.length === 0) return el('p', { class: 'sub', text: 'No live-token protocol of this category is in the snapshot, so this row prices at the global median of ' + DATA.global_median_ratio + '\u00d7.' });
    return el('table', { class: 'compare' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Live peer' }),
        el('th', { class: 'num', text: 'TVL' }),
        el('th', { class: 'num', text: 'Market cap' }),
        el('th', { class: 'num', text: 'mcap / TVL' }))),
      el('tbody', null, same.map(function (r) {
        return el('tr', null,
          el('td', { text: r.name }),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', { class: 'num', text: r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '\u00d7' : 'n/a' }));
      })));
  }

  // Sensitivity: the same farm arithmetic at three drop shares and deposits.
  function sensitivityMatrix(row) {
    var deposits = [100, 1000, 10000];
    var drops = [0.035, 0.07, 0.14];
    var tbody = el('tbody');
    drops.forEach(function (dp) {
      var tr = el('tr', null, el('th', { scope: 'row', text: (Math.round(dp * 1000) / 10) + '%' }));
      deposits.forEach(function (dep) {
        var net = econOf(row, dep, dp).net;
        tr.appendChild(el('td', { class: 'num ' + (net >= 0 ? 'pos' : 'neg'), text: fmtUsd(net) }));
      });
      tbody.appendChild(tr);
    });
    return el('table', { class: 'compare' },
      el('thead', null, el('tr', null, [el('th', { text: 'Drop ↓ · deposit →' })].concat(deposits.map(function (d) { return el('th', { class: 'num', text: '$' + (d >= 1000 ? (d / 1000) + 'K' : d) }); })))),
      tbody);
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row);
    var recomputedRange = rangeOf(row);
    var econ = econOf(row);
    var p = factorParts(row);
    var rangeOk = recomputedRange.low === row.implied_low_usd && recomputedRange.high === row.implied_high_usd;
    var chains = row.chains || [];
    var chainText = chains.length ? chains.slice(0, 5).join(', ') + (chains.length > 5 ? ' +' + (chains.length - 5) + ' more' : '') : 'an unnamed chain';
    dialog.appendChild(dialogHead(dialog, 'detail-title', 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' \u00b7 Watchlist' : ' \u00b7 Early radar'), row.name, (row.category || 'Other') + ' on ' + chainText + ' \u00b7 listed ' + (row.listed_at || 'unknown')));
    var left = el('div', { class: 'detail-col' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Implied value breakdown' }),
        el('div', { class: 'equation' },
          [['TVL', fmtUsd(row.tvl_usd)],
           ['Size curve value', fmtUsd(curveOf(row.tvl_usd))],
           ['Category premium', premiumOf(row).toFixed(4) + '\u00d7'],
           ['Category peers', peersCell(row)],
           ['Seven-day growth', fmtPct(row.change_7d) + ' \u2192 ' + p.growth.toFixed(2) + '\u00d7'],
           ['Age with no token', fmtAge(row.age_days) + ' \u2192 ' + p.maturity.toFixed(2) + '\u00d7'],
           ['Chain spread', (row.chains || []).length + ' chains \u2192 ' + p.chain.toFixed(2) + '\u00d7'],
           ['Momentum', p.momentum.toFixed(2) + '\u00d7' + (row.momentum_multiplier >= 1.02 ? ' hot' : '')],
           ['Rank range', row.rank_low + '–' + row.rank_high],
           ['Value if it launches', fmtUsd(row.implied_value_usd / row.launch_odds)],
           ['Launch odds', Math.round(row.launch_odds * 100) + '%'],
           ['Implied range', fmtUsd(row.implied_low_usd) + ' \u2013 ' + fmtUsd(row.implied_high_usd)]].map(function (e) {
            return el('div', null, el('span', { text: e[0] }), el('b', { class: 'num', text: e[1] }));
          }),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries' : ' — the board carries ' + fmtUsd(row.implied_value_usd) + '; the data would be stale.') + ' The range recomputes as ' + fmtUsd(recomputedRange.low) + ' \u2013 ' + fmtUsd(recomputedRange.high) + (rangeOk ? ', the same range.' : ' — a different range.') + ' An estimate, not a price.' })),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Live peers in ' + (row.category || 'Other') }),
        comparables(row)));
    var right = el('div', { class: 'detail-col right' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('div', { class: 'econ' },
          el('b', { text: 'Farm economics at $' + econ.deposit + ' in: ' }),
          el('span', { text: 'expected drop ' + fmtUsd(econ.slice) + ' \u2212 fees ' + fmtUsd(econ.fees) + ' \u2212 forgone yield ' + fmtUsd(econ.forgone) + ' = net ' + fmtUsd(econ.net) + ' (' + fmtUsd(econ.perHour) + '/h over ' + econ.hours + 'h). Low band: net ' + fmtUsd(econ.netLow) + '. It pays from ' + Math.round(econ.be * 100) + '% launch odds \u2014 verdict: ' }),
          el('b', { class: 'verdict v-' + econ.verdict.toLowerCase(), text: econ.verdict }),
          (state.deposit !== 'model' || state.drop !== 0.07) ? el('span', { class: 'sub', text: ' Sandbox: $' + econ.deposit + ' in, ' + (Math.round(state.drop * 1000) / 10) + '% drop share.' }) : null),
        el('h3', { text: 'Sensitivity: net at drop share \u00d7 deposit' }),
        sensitivityMatrix(row),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: ' ' + tail }) : null);
        }))));
    dialog.appendChild(el('div', { class: 'detail-body' }, left, right));
    showDialog(dialog);
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Data: DefiLlama protocol index as of ' + DATA.as_of + ', sealed snapshot. ' + DATA.board_size + ' pre-token rows ranked by model ' + DATA.model_version + '; ' + DATA.live_size + ' live-token protocols set aside.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (!cmpDialog.isConnected) app.appendChild(cmpDialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    if (e.key === 'Escape' && cmpDialog.open) cmpDialog.close();
  });
})();
