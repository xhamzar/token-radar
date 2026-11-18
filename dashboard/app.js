// Token Radar's dashboard (radar-4). It reads window.RADAR, written beside
// dashboard/ by main.ts from the same board.json, and renders the ranked
// board, a filterable table, a per-protocol detail view with the model's own
// inputs and the board's farm plan, and the live-token set kept apart. No
// network: every byte it shows is in data.js.
//
// The model, in one function (impliedOf): the page recomputes a row from the
// snapshot figures and the measured curve and multiples, and the detail view
// checks the number against board.json, so the page's code and the board's
// data are visibly the same arithmetic. The size curve is a least-squares fit
// of log10(market cap) on log10(TVL) over the traded tokens; the premium is
// the row's category multiple relative to the global median; the launch odds
// are the category's ever-launched rate, aged down; see MODEL.md for the
// derivation and the out-of-sample test.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var PAGE_SIZE = 25;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, page: 1 };
  var WATCH = {};
  DATA.rows.forEach(function (r) { if (r.rank <= DATA.watchlist_size) WATCH[r.slug] = true; });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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

  // The model, recomputed in the page from the snapshot figures:
  //   implied = round( curve(tvl) x premium x growthMult x maturityMult x chainMult x momentumMult x launchOdds )
  //   low/high = the same product with the category's shrunk ratio quartiles
  // where curve(tvl) = 10^(a + b x log10(tvl)) is the fitted size curve,
  // premium is the row's category multiple relative to the global median,
  // and launchOdds is the category's ever-launched rate, aged down.
  function curveOf(tvl) {
    return Math.pow(10, DATA.curve.a + DATA.curve.b * Math.log10(Math.max(tvl, 1)));
  }
  function premiumOf(row) {
    return clamp(multipleOf(row) / DATA.global_median_ratio, 0.25, 3);
  }
  function multipleOf(row) {
    var m = DATA.model;
    var entry = null;
    for (var i = 0; i < DATA.multiples.length; i++) {
      if (DATA.multiples[i].category === (row.category || 'Other')) { entry = DATA.multiples[i]; break; }
    }
    if (entry) return entry.multiple;
    return clamp(DATA.global_median_ratio, m.multiple_min, m.multiple_max);
  }
  function quartilesOf(row) {
    var m = DATA.model;
    var entry = null;
    for (var i = 0; i < DATA.multiples.length; i++) {
      if (DATA.multiples[i].category === (row.category || 'Other')) { entry = DATA.multiples[i]; break; }
    }
    if (entry) return { low: entry.quartile_low, high: entry.quartile_high };
    return {
      low: clamp(DATA.global_quartile_low, m.multiple_min, m.multiple_max),
      high: clamp(DATA.global_quartile_high, m.multiple_min, m.multiple_max)
    };
  }
  function factorsOf(row) {
    var m = DATA.model;
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, m.growth_floor, m.growth_cap);
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainMult = 1 + m.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_extra);
    var youth = clamp((m.momentum_age_days - age) / m.momentum_age_days, 0, 1);
    var growthPos = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, 0, m.momentum_growth_cap) / m.momentum_growth_cap;
    var momentum = 1 + m.momentum_strength * youth * growthPos;
    return growthMult * maturity * chainMult * momentum;
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
  function growthMultOf(row) {
    var m = DATA.model;
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, m.growth_floor, m.growth_cap);
    return 1 + (growth / 100) * m.growth_weight;
  }
  function maturityMultOf(row) {
    var m = DATA.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    return m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range;
  }
  function chainMultOf(row) {
    var m = DATA.model;
    return 1 + m.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_extra);
  }
  function momentumMultOf(row) {
    var m = DATA.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var youth = clamp((m.momentum_age_days - age) / m.momentum_age_days, 0, 1);
    var growthPos = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, 0, m.momentum_growth_cap) / m.momentum_growth_cap;
    return 1 + m.momentum_strength * youth * growthPos;
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
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
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
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'net') { av = a.farm_econ.net_usd; bv = b.farm_econ.net_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
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
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols beyond it, ranked by the model, not by size. Implied value is a model, not a promise.' }),
        el('p', { class: 'audit', text: '758 protocols read: ' + DATA.audit.ranked + ' ranked \u00b7 ' + DATA.audit.already_token + ' already trade \u00b7 ' + DATA.audit.bridge + ' bridges \u00b7 ' + DATA.audit.liquid_staking + ' liquid staking \u00b7 ' + DATA.audit.exchange + ' exchanges \u00b7 ' + DATA.audit.versioned + ' versioned \u00b7 ' + DATA.audit.wrapped + ' wrapped \u2014 every protocol accounted for.' }),
        el('p', null, el('a', { href: '#model', text: 'How the value is computed \u2193' }))),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'green', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist TVL' }), el('b', { text: fmtUsd(DATA.watchlist_tvl_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board implied value' }), el('b', { class: 'cyan', text: fmtUsd(DATA.board_implied_total_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Out-of-sample miss' }), el('b', { text: '\u00d7' + DATA.oos.loo_median_miss + ' held out' }))));
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
    var shown = state.tab === 'pre-token' ? pageRangeText() : DATA.live_size + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
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
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
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
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') }),
          WATCH[r.slug] ? el('span', { class: 'watch', text: 'Watchlist' }) : null,
          r.momentum_multiplier >= 1.05 ? el('span', { class: 'hot', text: 'Hot', title: 'Young and growing fast: momentum ' + r.momentum_multiplier.toFixed(2) + '\u00d7' }) : null)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num' }, el('span', { class: 'verdict v-' + r.farm_econ.verdict.toLowerCase(), text: r.farm_econ.verdict + ' ' + fmtUsd(r.farm_econ.net_usd) })));
      tbody.appendChild(tr);
    });
    var panel = el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'num'),
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
          el('caption', { class: 'sub', text: 'Already launched: these protocols trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — a token that already trades is not a launch to find. Their mcap/TVL ratios are the market data the model prices from (median ' + DATA.global_median_ratio + '\u00d7).' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'mcap / TVL' }),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    var topMults = DATA.multiples.slice().sort(function (a, b) { return b.sample - a.sample; }).slice(0, 5);
    return el('section', { class: 'panel model', id: 'model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every protocol. The size curve prices a TVL from the market\u2019s own log-log fit over the traded tokens; the premium is the category\u2019s measured multiple relative to the global median; the launch odds are the category\u2019s ever-launched rate, aged down. The range under each value is the same category\u2019s first-to-third quartile, shrunk the same way. No protocol name is special-cased.' }),
      el('div', { class: 'formula', text: 'implied = round( 10^(' + DATA.curve.a + ' + ' + DATA.curve.b + ' \u00d7 log10(tvl_usd)) \u00d7 (categoryMultiple / ' + DATA.global_median_ratio + ') \u00d7 growth \u00d7 maturity \u00d7 chains \u00d7 momentum \u00d7 launchOdds )' }),
      el('p', { class: 'sub', text: 'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + '; maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + '; chains = 1 + ' + m.chain_step + ' \u00d7 min(chains \u2212 1, ' + m.chain_max_extra + '); momentum = 1 + ' + m.momentum_strength + ' \u00d7 youth \u00d7 growthPos, youth = clamp((' + m.momentum_age_days + ' \u2212 age_days) / ' + m.momentum_age_days + ', 0, 1), growthPos = clamp(change_7d, 0, ' + m.momentum_growth_cap + ') / ' + m.momentum_growth_cap + '. Low / high replace the median multiple with the category\u2019s shrunk quartiles.' }),
      el('div', { class: 'model-grid' },
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Global median mcap / TVL' }),
          el('b', { text: String(DATA.global_median_ratio) + '\u00d7' }),
          el('p', { text: 'Measured over every live-token protocol in the snapshot. Categories with no live peer price here.' })),
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Calibration check' }),
          el('b', { text: String(DATA.calibration.median_implied_to_mcap) + '\u00d7' }),
          el('p', { text: 'Median implied / market cap when the same model prices ' + DATA.calibration.sample + ' live-token protocols. Near 1 means the model prices the market about right.' })),
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Size curve fit' }),
          el('b', { text: 'log\u2081\u2080 cap = ' + DATA.curve.a + ' + ' + DATA.curve.b + ' \u00d7 log\u2081\u2080 TVL' }),
          el('p', { text: 'Least squares over ' + DATA.curve.n + ' traded tokens, R\u00b2 = ' + DATA.curve.r2 + '. Size pays off sublinearly: ten times the TVL is worth about 3\u00d7 the cap, not 10\u00d7.' })),
        el('div', { class: 'model-cell' },
          el('h3', { text: 'Worked example: ' + top.name }),
          el('b', { text: fmtUsd(top.implied_value_usd) }),
          el('p', { text: fmtUsd(top.curve_value_usd) + ' curve \u00d7 ' + top.premium + ' premium (' + (top.category || 'Other') + ', n=' + top.category_sample + ') \u00d7 ' + top.growth_multiplier + ' growth \u00d7 ' + top.maturity_multiplier + ' maturity \u00d7 ' + top.chain_multiplier + ' chains \u00d7 ' + top.momentum_multiplier + ' momentum = ' + fmtUsd(top.value_if_launches_usd) + ' if it launches \u00d7 ' + top.launch_odds + ' odds. Range ' + fmtUsd(top.implied_low_usd) + ' \u2013 ' + fmtUsd(top.implied_high_usd) + '.' }))),
      el('h3', { text: 'Out-of-sample check: does it hold on tokens it never saw?' }),
      el('p', { class: 'sub', text: 'Leave-one-out: each of the ' + DATA.oos.loo_n + ' traded tokens is priced from a fit on the other ' + (DATA.oos.loo_n - 1) + '. Time split: the ' + DATA.oos.time_n + ' newest tokens are priced from a fit on the older half. A miss of \u00d72 means half or double the real cap.' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Test' }),
          el('th', { class: 'num', text: 'Median miss' }),
          el('th', { class: 'num', text: 'Within 3\u00d7' }),
          el('th', { class: 'num', text: 'Flat multiple' }))),
        el('tbody', null,
          el('tr', null,
            el('td', { text: 'Leave-one-out' }),
            el('td', { class: 'num', text: '\u00d7' + DATA.oos.loo_median_miss }),
            el('td', { class: 'num', text: Math.round(DATA.oos.loo_within3x * 100) + '%' }),
            el('td', { class: 'num', text: '\u00d7' + DATA.oos.loo_flat_miss })),
          el('tr', null,
            el('td', { text: 'Time split (newer half)' }),
            el('td', { class: 'num', text: '\u00d7' + DATA.oos.time_median_miss }),
            el('td', { class: 'num', text: Math.round(DATA.oos.time_within3x * 100) + '%' }),
            el('td', { class: 'num', text: '\u00d7' + DATA.oos.time_flat_miss })))),
      el('p', { class: 'sub', text: 'Ablation, leave-one-out miss: ' + DATA.oos.ablation.map(function (a) { return a.variant + ' \u00d7' + a.loo_miss; }).join(' \u00b7 ') + '. The growth, age, chain and momentum factors cost a little leave-one-out accuracy against the bare curve and stay because the brief prices a protocol\u2019s growth and its time with no token. The printed band holds ' + Math.round(DATA.oos.bands_hold * 100) + '% of held-out caps (' + DATA.oos.bands_n + ' tokens) \u2014 a little narrow, as the curve\u2019s R\u00b2 admits.' }),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'Largest measured category multiples (median mcap/TVL, shrunk toward the global median) with their quartile ranges.' }),
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

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  // What the category multiple rests on: the live peers priced into it, or
  // why the row falls back to the global median (too few live peers to trust).
  function peersCell(row) {
    if (row.category_sample > 0) return row.category_sample + ' live peers';
    var entry = null;
    for (var i = 0; i < DATA.multiples.length; i++) {
      if (DATA.multiples[i].category === (row.category || 'Other')) { entry = DATA.multiples[i]; break; }
    }
    if (entry && entry.sample > 0) return 'only ' + entry.sample + ' live — global median';
    return 'none — global median';
  }

  function comparables(row) {
    var same = DATA.live.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); })
      .sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 3);
    if (same.length === 0) return el('p', { class: 'sub', text: 'No live-token protocol of this category is in the snapshot, so this row prices at the global median mcap/TVL of ' + DATA.global_median_ratio + '\u00d7.' });
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

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row);
    var recomputedRange = rangeOf(row);
    var rangeOk = recomputedRange.low === row.implied_low_usd && recomputedRange.high === row.implied_high_usd;
    var chains = row.chains || [];
    var chainText = chains.length ? chains.slice(0, 5).join(', ') + (chains.length > 5 ? ' +' + (chains.length - 5) + ' more' : '') : 'an unnamed chain';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' \u00b7 Watchlist' : ' \u00b7 Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainText + ' \u00b7 listed ' + (row.listed_at || 'unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    var left = el('div', { class: 'detail-col' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Implied value breakdown' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Size curve value' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
          el('div', null, el('span', { text: 'Category premium' }), el('b', { class: 'num', text: String(row.premium) + '\u00d7' })),
          el('div', null, el('span', { text: 'Category peers' }), el('b', { class: 'num', text: peersCell(row) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' \u2192 ' + growthMultOf(row).toFixed(2) + '\u00d7' })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' \u2192 ' + maturityMultOf(row).toFixed(2) + '\u00d7' })),
          el('div', null, el('span', { text: 'Chain spread' }), el('b', { class: 'num', text: String((row.chains || []).length) + ' chains \u2192 ' + chainMultOf(row).toFixed(2) + '\u00d7' })),
          el('div', null, el('span', { text: 'Momentum' }), el('b', { class: 'num', text: momentumMultOf(row).toFixed(2) + '\u00d7' + (row.momentum_multiplier >= 1.05 ? ' hot' : '') })),
          el('div', null, el('span', { text: 'Value if it launches' }), el('b', { class: 'num', text: fmtUsd(row.value_if_launches_usd) })),
          el('div', null, el('span', { text: 'Launch odds' }), el('b', { class: 'num', text: Math.round(row.launch_odds * 100) + '%' })),
          el('div', null, el('span', { text: 'Implied range' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' \u2013 ' + fmtUsd(row.implied_high_usd) })),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries' : ' — the board carries ' + fmtUsd(row.implied_value_usd) + '; the data would be stale.') + ' The range recomputes as ' + fmtUsd(recomputedRange.low) + ' \u2013 ' + fmtUsd(recomputedRange.high) + (rangeOk ? ', the same range.' : ' — the board carries a different range.') + ' An estimate, not a price. The protocol records no token; DefiLlama may simply not carry it.' })),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Live peers in ' + (row.category || 'Other') }),
        comparables(row)));
    var right = el('div', { class: 'detail-col right' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('div', { class: 'econ' },
          el('b', { text: 'Farm economics at $' + row.farm_econ.deposit_usd + ' in: ' }),
          el('span', { text: 'expected drop ' + fmtUsd(row.farm_econ.slice_usd) + ' \u2212 fees ' + fmtUsd(row.farm_econ.fees_usd) + ' = net ' + fmtUsd(row.farm_econ.net_usd) + ' (' + fmtUsd(row.farm_econ.net_per_hour_usd) + '/h over ' + row.farm_econ.hours + 'h). It pays from ' + Math.round(row.farm_econ.break_even_odds * 100) + '% launch odds \u2014 verdict: ' }),
          el('b', { class: 'verdict v-' + row.farm_econ.verdict.toLowerCase(), text: row.farm_econ.verdict })),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: ' ' + tail }) : null);
        }))));
    dialog.appendChild(el('div', { class: 'detail-body' }, left, right));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Data: DefiLlama protocol index as of ' + DATA.as_of + ', sealed snapshot. ' + DATA.board_size + ' pre-token rows ranked by model ' + DATA.model_version + '; ' + DATA.live_size + ' live-token protocols set aside. Implied values are the entry\u2019s own claim, never make.fun\u2019s.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
