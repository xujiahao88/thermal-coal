/* 动力煤季节性图谱（汾渭 + 国联民生）
   数据由 scripts/build_data.py（汾渭）与 scripts/build_data_glms.py（国联民生）提取

   布局仿汾渭站：**一个数据集 = 一个页面（顶部 tab 切换）**，
   数据源开关（全部/汾渭/国联民生）只决定显示哪些 tab。
   每页从上到下：KPI 头条 → 汇总表 → 指标块季节图。
   「重点序列」（合计 / 25省合计 / 环渤海 / 大秦线 / 澳洲5500 等）高亮并排最前。 */
(function () {
  'use strict';

  var PALETTE = ['#00B0F0', '#002060', '#632523', '#F79646', '#FF0000',
                 '#9BBB59', '#8064A2', '#4BACC6', '#C0504D'];

  var S = {
    meta: null, xaxis: [],
    src: 'all',                  // 数据源过滤：'all' | 'fenwei' | 'glms'
    dsId: null, data: null,      // 当前数据集（一页一个）
    years: [], hidden: {},
    connect: true, zero: false, sync: false,
    items: [],            // {inst, el, cfg}
    io: null,
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------- 工具

  function fmtVal(v, unit) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    if (unit === '%') return (v * 100).toFixed(1) + '%';
    if (unit === '元/吨') return Math.round(v).toLocaleString('zh-CN');
    if (unit === '万吨') return v.toFixed(1);
    if (unit === '天') return v.toFixed(1);
    if (unit === '美元/吨') return v.toFixed(1);
    return v.toFixed(2);
  }
  function fmtAxis(v, unit) {
    if (unit === '%') return (v * 100).toFixed(0) + '%';
    if (unit === '元/吨') return Math.round(v);
    if (unit === '美元/吨') return v.toFixed(0);
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万';
    if (unit === '万吨' || unit === '天') return Math.round(v);
    return v.toFixed(0);
  }
  // X 轴刻度：只在「每月 1 号」打一个标签，其余返回空串。
  // 366 点 category 轴若逐点都返回「N月」，ECharts 抽稀后会出现
  // 「01月 01月 02月 02月 …」的重复标签，故必须只打首日。
  function monthLabel(md) {
    var p = String(md).split('-');
    if (p[1] !== '01') return '';
    return (parseInt(p[0], 10)) + '月';
  }
  function dayLabel(md) {
    var p = String(md).split('-');
    return (+p[0]) + '月' + (+p[1]) + '日';
  }

  // 取某系列最后一个有效值
  function lastOf(arr) {
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
    return null;
  }

  // ---------------------------------------------------------- 加载

  function loadJSON(p) {
    return fetch(p, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(p + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    S.shot = params.get('shot') === '1';   // 截图模式：当前页全量渲染，便于无头整页截图
    var wantedSrc = params.get('src');
    var wantedDs = params.get('ds');

    function init() {
      if (wantedSrc && (wantedSrc === 'all' || S.meta.sources.some(function (s) { return s.id === wantedSrc; }))) {
        S.src = wantedSrc;
      }
      renderSourceToggles();
      renderTabs();
      var list = visibleDatasets();
      var first = list.length ? list[0].id : null;
      if (wantedDs && list.some(function (d) { return d.id === wantedDs; })) first = wantedDs;
      if (first) switchTo(first, true);
      else {
        var ld = $('loading');
        if (ld) ld.innerHTML = '<div style="color:#c0392b">没有可用的数据集</div>';
      }
    }

    // data.js 内联 → 直接用
    if (window.__FENWEI_DATA && window.__FENWEI_DATA.meta) {
      S.meta = window.__FENWEI_DATA.meta;
      S.xaxis = S.meta.xaxis || [];
      init();
      return;
    }

    // 兜底：逐个 fetch
    loadJSON('data/meta.json').then(function (meta) {
      S.meta = meta;
      S.xaxis = meta.xaxis || [];
      return Promise.all(meta.datasets.map(function (d) {
        return loadJSON('data/' + d.id + '.json').catch(function () { return null; });
      })).then(function (arr) {
        window.__FENWEI_DATA = { meta: meta };
        meta.datasets.forEach(function (d, i) { if (arr[i]) window.__FENWEI_DATA[d.id] = arr[i]; });
        init();
      });
    }).catch(function (e) {
      $('loading').innerHTML =
        '<div style="color:#c0392b">数据加载失败：' + e.message + '</div>';
    });
  }

  // ---------------------------------------------------------- 数据源开关

  function sourcesOf() {
    var s = S.meta && S.meta.sources;
    return (s && s.length > 1) ? s : null;
  }

  function visibleDatasets() {
    var srcs = sourcesOf();
    return S.meta.datasets.filter(function (d) {
      if (!srcs || S.src === 'all') return true;
      return (d.source || 'fenwei') === S.src;
    });
  }

  function srcName(id) {
    var srcs = sourcesOf() || [];
    var hit = srcs.filter(function (x) { return x.id === id; })[0];
    return hit ? hit.name : id;
  }

  function renderSourceToggles() {
    var box = $('srcToggles');
    if (!box) return;
    var srcs = sourcesOf();
    if (!srcs) { box.style.display = 'none'; return; }
    box.style.display = '';
    var all = [{ id: 'all', name: '全部' }].concat(srcs);
    box.innerHTML = '';
    all.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'src' + (S.src === s.id ? ' on' : '');
      b.textContent = s.name;
      b.onclick = function () {
        if (S.src === s.id) return;
        S.src = s.id;
        renderSourceToggles();
        renderTabs();
        var list = visibleDatasets();
        if (list.length) switchTo(list[0].id, true);
      };
      box.appendChild(b);
    });
  }

  // ---------------------------------------------------------- Tab（一页一个数据集）

  function renderTabs() {
    var box = $('tabs');
    if (!box) return;
    box.innerHTML = '';
    visibleDatasets().forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'tab' + (d.id === S.dsId ? ' active' : '');
      // 用户要求去掉「国联/汾渭」来源小标签：短名本身已唯一，无需来源标注
      b.innerHTML = (d.short || d.name) + '<span class="n">' + d.count + '图</span>';
      b.onclick = function () { switchTo(d.id); };
      box.appendChild(b);
    });
  }

  function switchTo(id, force) {
    if (S.dsId === id && !force) return;
    S.dsId = id;
    renderTabs();      // 重建 tab 行（高亮当前数据集）
    S.data = window.__FENWEI_DATA[id];
    if (!S.data) {
      var ld0 = $('loading');
      if (ld0) ld0.innerHTML = '<div style="color:#c0392b">数据集加载失败：' + id + '</div>';
      return;
    }
    S.years = collectYears(S.data);
    S.hidden = {};
    setSubText();
    renderYearToggles();
    render();
    var _ld = $('loading'); if (_ld) _ld.style.display = 'none';
    if (new URLSearchParams(location.search).get('debug') === '1') dumpDebug();
  }

  function setSubText() {
    var d = S.data;
    var total = S.meta.datasets.reduce(function (a, x) { return a + x.count; }, 0);
    var srcTxt = (S.src !== 'all') ? srcName(S.src) + ' · ' : '';
    $('sub').innerHTML = srcTxt + (d ? d.name : '') +
      '　数据更新至 <b>' + (d ? d.updated : '-') + '</b> · 本页 <b>' +
      (d ? d.count : 0) + '</b> 图 / 全站 <b>' + total + '</b> 图';
    $('footNote').textContent = '数据提取时间：' + (S.meta.generatedAt || '-') +
      ' · 来源：汾渭动力煤.xlsx + 《煤炭行业高频数据》';
  }

  function collectYears(d) {
    var set = {};
    d.rows.forEach(function (r) {
      r.charts.forEach(function (c) {
        c.years.forEach(function (y) { if (y) set[y] = 1; });
      });
    });
    return Object.keys(set).map(Number).sort();
  }

  // ---------------------------------------------------------- 年份开关

  function yearColor(y, i) {
    var d = S.data;
    if (d && d.rows) {
      for (var ri = 0; ri < d.rows.length; ri++) {
        var cs = d.rows[ri].charts || [];
        for (var ci = 0; ci < cs.length; ci++) {
          var c = cs[ci];
          var k = (c.years || []).indexOf(y);
          if (k >= 0 && c.colors && c.colors[k]) return c.colors[k];
        }
      }
    }
    return PALETTE[i % PALETTE.length];
  }

  function renderYearToggles() {
    var box = $('yearToggles');
    box.innerHTML = '';
    S.years.forEach(function (y, i) {
      var b = document.createElement('button');
      b.className = 'yt' + (S.hidden[y] ? ' off' : '');
      b.innerHTML = '<span class="dot" style="background:' + yearColor(y, i) + '"></span>' + y;
      b.onclick = function () {
        S.hidden[y] = !S.hidden[y];
        b.className = 'yt' + (S.hidden[y] ? ' off' : '');
        refreshAll();
      };
      box.appendChild(b);
    });
  }

  // ---------------------------------------------------------- 图表排序（重点排最前）

  function orderedCharts(row) {
    return row.charts.slice().sort(function (a, b) {
      return (b.key ? 1 : 0) - (a.key ? 1 : 0);
    });
  }

  // ---------------------------------------------------------- 渲染

  function render() {
    if (S.io) { S.io.disconnect(); S.io = null; }
    disposeAll();
    var main = $('main');
    main.innerHTML = '';
    S.items = [];

    // ① KPI 头条（重点序列的最新值与同比/环比）
    var hl = buildHeadline();
    if (hl) main.appendChild(hl);

    // ② 数据表
    main.appendChild(buildTableSection());

    // ③ 图表块
    S.data.rows.forEach(function (row) {
      main.appendChild(buildRowBlock(row));
    });

    if (S.shot) {
      S.items.forEach(function (it) {
        it.el.style.height = '280px';
        lazyInit(it.el);
        if (it.inst) it.inst.resize();
      });
    } else {
      observe();
      S.items.slice(0, 24).forEach(function (it) { lazyInit(it.el); });
    }
  }

  // KPI 头条：每个指标块取「重点序列」（无 key 则第一张图），展示最新值 + 环比 + 同比
  function buildHeadline() {
    var cards = [];
    S.data.rows.forEach(function (row) {
      var key = orderedCharts(row).filter(function (c) { return c.key; })[0] || row.charts[0];
      var t = key.table;
      if (!t || !t.values || t.values[0] === null) return;
      cards.push({ row: row, key: key, t: t });
    });
    if (!cards.length) return null;

    var strip = document.createElement('div');
    strip.className = 'headline';
    cards.forEach(function (o) {
      var row = o.row, key = o.key, t = o.t;
      var cur = t.values[0], prev = t.values[1], ly = t.values[2];
      var date = String(t.labels[0] || '').slice(5);

      var card = document.createElement('div');
      card.className = 'hl-card' + (key.key ? ' key' : '');

      var h = document.createElement('div');
      h.className = 'hl-t';
      h.innerHTML = (key.key ? '<span class="badge-key">重点</span>' : '') +
        '<b>' + key.colName + '</b>' +
        '<span class="hl-g" title="' + row.name + '">' + row.name + '</span>';
      card.appendChild(h);

      var v = document.createElement('div');
      v.className = 'hl-v';
      v.innerHTML = '<b>' + fmtVal(cur, key.unit) + '</b>' +
        (key.unit ? '<small>' + key.unit + '</small>' : '');
      card.appendChild(v);

      var d = document.createElement('div');
      d.className = 'hl-d';
      d.textContent = '更新 ' + date;
      card.appendChild(d);

      var rel = document.createElement('div');
      rel.className = 'hl-r';
      rel.innerHTML = relChip('环比', cur, prev, key.unit) + relChip('同比', cur, ly, key.unit);
      card.appendChild(rel);

      strip.appendChild(card);
    });
    return strip;
  }

  function relChip(label, cur, base, unit) {
    if (base === null || base === undefined || isNaN(base)) return '';
    var diff = cur - base;
    var pct = base !== 0 ? (diff / Math.abs(base)) * 100 : null;
    var cls = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
    var txt = label + ' ' + (diff >= 0 ? '+' : '') + fmtVal(diff, unit);
    if (pct !== null && isFinite(pct)) txt += ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
    return '<span class="rel ' + cls + '">' + txt + '</span>';
  }

  // 调试钩子（仅 ?debug=1）
  function dumpDebug() {
    var pre = document.createElement('pre');
    pre.id = 'dbg';
    pre.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;font:10px monospace;';
    var out = ['DBGSTART', 'items=' + S.items.length];
    try {
      S.items.forEach(function (it) {
        var c = it.cfg;
        var line = c.title + ' inst=' + (!!it.inst) + ' key=' + (c.key ? 1 : 0);
        if (it.inst) {
          var op = it.inst.getOption();
          var ya = (op.yAxis && op.yAxis[0]) || {};
          line += ' y=[' + ya.min + ',' + ya.max + ']';
          (op.series || []).forEach(function (s) {
            line += ' | ' + s.name + '[' + s.type + ']';
          });
        }
        out.push(line);
      });
    } catch (e) { out.push('ERR: ' + (e && e.message)); }
    out.push('DBGEND');
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }

  function buildRowBlock(row) {
    var block = document.createElement('section');
    block.className = 'row-block';

    var head = document.createElement('div');
    head.className = 'row-head';
    var span = rowSpan(row);
    head.innerHTML =
      '<h2>' + row.name +
      (row.unit ? '<span class="unit">单位：' + row.unit + '</span>' : '') +
      (span ? '<span class="span">' + span + '</span>' : '') +
      '</h2><span class="spacer"></span>' +
      '<span class="hint">' + row.charts.length + ' 张 · 点击图例可隐藏某年</span>';
    block.appendChild(head);

    var grid = document.createElement('div');
    var n = Math.max(1, row.charts.length);
    grid.className = 'grid cols-' + (n <= 8 ? n : 8);
    orderedCharts(row).forEach(function (cfg) {
      grid.appendChild(makeCard(cfg, row));
    });
    block.appendChild(grid);
    return block;
  }

  function rowSpan(row) {
    var years = [];
    row.charts.forEach(function (c) {
      (c.years || []).forEach(function (y) { if (years.indexOf(y) < 0) years.push(y); });
    });
    if (!years.length) return '';
    years.sort(function (a, b) { return a - b; });
    var first = years[0], last = years[years.length - 1];
    return first === last ? String(first) : (first + '–' + last);
  }

  function buildTableSection() {
    var wrap = document.createElement('div');
    wrap.className = 'table-view';

    var title = document.createElement('h2');
    title.className = 'table-title';
    title.textContent = S.data.name + ' · 周度快照';
    wrap.appendChild(title);

    var scroller = document.createElement('div');
    scroller.className = 'table-scroll';

    var table = document.createElement('table');
    table.className = 'summary-table';

    var trows = (S.data.table_rows && S.data.table_rows.length) ? S.data.table_rows : S.data.rows;

    // 第一行：指标名
    var tr1 = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'row-label';
    corner.rowSpan = 2;
    corner.textContent = '指标';
    tr1.appendChild(corner);
    trows.forEach(function (row) {
      var th = document.createElement('th');
      th.colSpan = Math.max(1, row.charts.length);
      th.className = 'metric-head';
      th.textContent = row.name + (row.unit ? '（' + row.unit + '）' : '');
      tr1.appendChild(th);
    });
    table.appendChild(tr1);

    // 第二行：各地区/序列（重点列加 col-total 高亮）。
    // ⚠️ 不要补空占位 th：第一行「指标」rowSpan=2 已占用本行第 1 列，
    //    再补会把所有表头右移一列、与数据错位（历史 bug）。
    var tr2 = document.createElement('tr');
    trows.forEach(function (row) {
      orderedCharts(row).forEach(function (ch) {
        var th = document.createElement('th');
        th.textContent = ch.colName;
        if (ch.key) th.className = 'col-total';
        tr2.appendChild(th);
      });
    });
    table.appendChild(tr2);

    // 数据行
    var refTable = (trows[0] && trows[0].charts[0] && trows[0].charts[0].table) || {};
    var labels = refTable.dateLabels || refTable.labels || ['本期', '上期', '去年同期', '环比', '同比'];
    labels.forEach(function (label, ri) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.className = 'row-label';
      th.textContent = label;
      tr.appendChild(th);
      trows.forEach(function (row) {
        orderedCharts(row).forEach(function (ch) {
          var td = document.createElement('td');
          var v = (ch.table && ch.table.values) ? ch.table.values[ri] : null;
          td.textContent = fmtVal(v, row.unit);
          var cls = [];
          if (ch.key) cls.push('col-total');
          if (ri >= 3 && v !== null && v !== undefined && !isNaN(v)) {
            cls.push(v > 0 ? 'up' : (v < 0 ? 'down' : ''));
          }
          if (cls.length) td.className = cls.filter(Boolean).join(' ');
          tr.appendChild(td);
        });
      });
      table.appendChild(tr);
    });

    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
  }

  function makeCard(cfg, row) {
    var card = document.createElement('div');
    card.className = 'card' + (cfg.key ? ' key' : '');

    var head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = (cfg.key ? '<span class="badge-key">重点</span>' : '') +
                     '<span class="t">' + cfg.title + '</span>' +
                     (cfg.unit ? '<span class="u">' + cfg.unit + '</span>' : '');
    card.appendChild(head);

    var box = document.createElement('div');
    box.className = 'chart';
    card.appendChild(box);

    if (cfg.table && cfg.table.labels && cfg.table.values) {
      var tblWrap = document.createElement('div');
      tblWrap.className = 'data-table';
      var html = '<table><thead><tr>';
      cfg.table.labels.forEach(function (l) { html += '<th>' + l + '</th>'; });
      html += '</tr></thead><tbody><tr>';
      cfg.table.values.forEach(function (v) { html += '<td>' + fmtVal(v, cfg.unit) + '</td>'; });
      html += '</tr></tbody></table>';
      tblWrap.innerHTML = html;
      card.appendChild(tblWrap);
    }

    var foot = document.createElement('div');
    foot.className = 'card-foot';
    foot.innerHTML = '<span class="latest">' + latestText(cfg) + '</span>' +
                     '<button class="dl" title="下载 PNG">⤓ PNG</button>';
    card.appendChild(foot);

    foot.querySelector('.dl').onclick = function () {
      var it = S.items.filter(function (x) { return x.el === box; })[0];
      if (!it || !it.inst) { lazyInit(box); it = S.items.filter(function (x) { return x.el === box; })[0]; }
      if (!it || !it.inst) return;
      var a = document.createElement('a');
      a.download = cfg.title + '.png';
      a.href = it.inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      a.click();
    };

    S.items.push({ el: box, inst: null, cfg: cfg, row: row });
    return card;
  }

  function latestText(cfg) {
    var n = cfg.years.length;
    if (n < 2) return '';
    var curS = cfg.series[n - 1] || [];
    // 找本年最后一个有值点的「索引」——同比必须跟去年「同一索引」（同期）比
    var idx = -1;
    for (var i = curS.length - 1; i >= 0; i--) if (curS[i] !== null) { idx = i; break; }
    if (idx < 0) return '最新：<b>-</b>';
    var cur = curS[idx];
    var txt = '最新：<b>' + fmtVal(cur, cfg.unit) + '</b>';
    var prvS = cfg.series[n - 2] || [];
    // 去年同槽 ±3 找最近值（周度数据逐年有 0~3 天漂移）
    var prv = null;
    for (var off = 0; off <= 3 && prv === null; off++) {
      for (var _sgn = 0; _sgn < 2 && prv === null; _sgn++) {
        var c = idx + (_sgn ? off : -off);
        if (c >= 0 && c < prvS.length && prvS[c] !== null && prvS[c] !== undefined) prv = prvS[c];
      }
    }
    if (prv !== null && prv !== 0) {
      var d = cur - prv;
      var pct = (d / Math.abs(prv)) * 100;
      var cls = d >= 0 ? 'up' : 'down';
      txt += ' <span class="rel ' + cls + '">同比' + (d >= 0 ? '+' : '') + pct.toFixed(1) + '%</span>';
    }
    return txt;
  }

  // ---------------------------------------------------------- 图表

  function seriesColor(cfg, i) {
    if (cfg.colors && cfg.colors[i]) return cfg.colors[i];
    return PALETTE[i % PALETTE.length];
  }

  // 对长缺失段自动断开，避免连成竖直大线
  var MAX_GAP = 21;
  function splitSeries(name, fullData, color, lineWidth, isCurrent, dashed, maxGap) {
    var MG = (maxGap && maxGap > 0) ? maxGap : MAX_GAP;
    var pieces = [];
    var cur = new Array(fullData.length).fill(null);
    var has = false;
    var lastIdx = -1e9;
    for (var i = 0; i < fullData.length; i++) {
      var v = fullData[i];
      if (v === null || v === undefined || isNaN(v)) continue;
      if (i - lastIdx > MG && has) {
        pieces.push(cur);
        cur = new Array(fullData.length).fill(null);
        has = false;
      }
      cur[i] = v;
      lastIdx = i;
      has = true;
    }
    if (has) pieces.push(cur);
    if (pieces.length === 0) pieces.push(cur);
    return pieces.map(function (data) {
      return {
        name: name,
        type: 'line',
        data: data,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: isCurrent ? 2.4 : 1.5,
        connectNulls: S.connect,
        lineStyle: { width: lineWidth, color: color, type: dashed ? 'dashed' : 'solid' },
        itemStyle: { color: color },
        emphasis: { focus: 'series', scale: true, lineStyle: { width: lineWidth + 0.7 } },
        z: isCurrent ? 10 : 2,
      };
    });
  }

  function buildOption(cfg, yMin, yMax) {
    var series = [];
    var maxYear = Math.max.apply(null, cfg.years);
    cfg.years.forEach(function (y, i) {
      if (S.hidden[y]) return;
      var color = seriesColor(cfg, i);
      var isCurrent = (y === maxYear);
      var lineWidth = isCurrent ? 1.8 : 1.2;
      var isDash = !!(cfg.dashYears && cfg.dashYears.indexOf(y) >= 0);
      splitSeries(String(y), cfg.series[i], color, lineWidth, isCurrent, isDash, cfg.maxGap)
        .forEach(function (s) { series.push(s); });
    });

    var unit = cfg.unit;
    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 8, right: 12, top: 30, bottom: 4, containLabel: true },
      legend: {
        top: 2, left: 'center', itemWidth: 14, itemHeight: 8, itemGap: 10,
        textStyle: { fontSize: 10.5, color: '#5a657c' },
        data: cfg.years.map(String),
        selected: cfg.years.reduce(function (o, y) { o[y] = !S.hidden[y]; return o; }, {}),
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,.97)',
        borderColor: '#dfe4ee', borderWidth: 1,
        textStyle: { color: '#1c2536', fontSize: 11.5 },
        axisPointer: { type: 'line', lineStyle: { color: '#b9c2d4', type: 'dashed' } },
        formatter: function (ps) {
          if (!ps || !ps.length) return '';
          var h = '<div style="font-weight:600;margin-bottom:3px">' + dayLabel(ps[0].axisValue) + '</div>';
          ps.forEach(function (p) {
            if (p.value === null || p.value === undefined) return;
            h += '<div style="display:flex;align-items:center;gap:5px;line-height:1.6">' +
                 p.marker + '<span style="flex:1">' + p.seriesName + '</span>' +
                 '<b style="font-variant-numeric:tabular-nums">' + fmtVal(p.value, unit) + '</b></div>';
          });
          return h || '';
        },
      },
      xAxis: {
        type: 'category',
        data: S.xaxis,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#c9d1e0' } },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10, color: '#8a94a8', hideOverlap: true,
          formatter: monthLabel,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: !(S.zero || cfg.zeroBase),
        min: yMin,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10, color: '#8a94a8',
          formatter: function (v) { return fmtAxis(v, unit); },
        },
        splitLine: { lineStyle: { color: '#eef1f7' } },
      },
      series: series,
    };
  }

  function rowRange(row) {
    var lo = Infinity, hi = -Infinity, anyZero = false;
    row.charts.forEach(function (cfg) {
      if (cfg.zeroBase) anyZero = true;
      cfg.years.forEach(function (y, i) {
        if (S.hidden[y]) return;
        var a = cfg.series[i] || [];
        for (var k = 0; k < a.length; k++) {
          var v = a[k];
          if (v === null || v === undefined) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      });
      if (cfg.yMin != null && cfg.yMin < lo) lo = cfg.yMin;
    });
    if (lo === Infinity) return [null, null];
    if (S.zero) lo = Math.min(0, lo);
    if (anyZero) { lo = 0; if (!(hi > 0)) hi = 1; }
    return [lo, hi];
  }

  function calcRange(cfg) {
    var lo = Infinity, hi = -Infinity;
    cfg.years.forEach(function (y, i) {
      if (S.hidden[y]) return;
      var a = cfg.series[i] || [];
      for (var k = 0; k < a.length; k++) {
        var v = a[k];
        if (v === null || v === undefined) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
    if (lo === Infinity) return [null, null];
    if (cfg.yMin != null && cfg.yMin < lo) lo = cfg.yMin;
    if (S.zero) lo = Math.min(0, lo);
    if (cfg.zeroBase) { lo = 0; if (!(hi > 0)) hi = 1; }
    return [lo, hi];
  }

  function lazyInit(el) {
    var it = S.items.filter(function (x) { return x.el === el; })[0];
    if (!it || it.inst) return;
    var rng = S.sync ? rowRange(it.row) : calcRange(it.cfg);
    it.inst = echarts.init(el, null, { renderer: 'canvas' });
    it.inst.setOption(buildOption(it.cfg, rng[0], rng[1]));
  }

  function refreshAll() {
    var rowRanges = {};
    if (S.sync && S.data) {
      S.data.rows.forEach(function (row) { rowRanges[row.name] = rowRange(row); });
    }
    S.items.forEach(function (it) {
      if (!it.inst) return;
      var rng = S.sync ? (rowRanges[it.row.name] || calcRange(it.cfg)) : calcRange(it.cfg);
      it.inst.setOption(buildOption(it.cfg, rng[0], rng[1]), true);
      it.inst.resize();
    });
  }

  function disposeAll() {
    S.items.forEach(function (it) { if (it.inst) { it.inst.dispose(); it.inst = null; } });
    S.items = [];
    if (S.io) { S.io.disconnect(); S.io = null; }
  }

  // 懒加载：进入视口才画图
  function observe() {
    if (S.io) S.io.disconnect();
    if (!('IntersectionObserver' in window)) {
      S.items.forEach(function (it) { lazyInit(it.el); });
      return;
    }
    S.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          lazyInit(e.target);
          S.io.unobserve(e.target);
        }
      });
    }, { rootMargin: '300px 0px' });
    S.items.forEach(function (it) { S.io.observe(it.el); });
  }

  // ---------------------------------------------------------- 事件

  function bindUI() {
    $('optConnect').onchange = function () { S.connect = this.checked; refreshAll(); };
    $('optZero').onchange = function () { S.zero = this.checked; refreshAll(); };
    $('optSync').onchange = function () { S.sync = this.checked; refreshAll(); };
    $('btnTop').onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };

    var expanded = false;
    $('btnExpand').onclick = function () {
      expanded = !expanded;
      S.items.forEach(function (it) {
        if (expanded) lazyInit(it.el);
        it.el.style.height = expanded ? '340px' : '270px';
        if (it.inst) it.inst.resize();
      });
      this.textContent = expanded ? '恢复高度' : '全部展开';
      if (!expanded) refreshAll();
    };

    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        S.items.forEach(function (it) { if (it.inst) it.inst.resize(); });
      }, 160);
    });
  }

  bindUI();

  // 调试钩子（无副作用，便于自动化探测/排障）
  window.__TC = {
    state: function () {
      var rows = (S.data && S.data.rows) || [];
      return {
        src: S.src,
        dsId: S.dsId,
        dsName: S.data ? S.data.name : null,
        sources: (S.meta && S.meta.sources || []).map(function (s) { return s.id; }),
        datasets: (S.meta && S.meta.datasets || []).length,
        visibleDatasets: visibleDatasets().map(function (d) { return d.id; }),
        rows: rows.length,
        charts: rows.reduce(function (a, r) { return a + r.charts.length; }, 0),
        keyCharts: rows.reduce(function (a, r) {
          return a + r.charts.filter(function (c) { return c.key; }).length; }, 0),
        years: S.years.slice(),
      };
    },
    setSrc: function (id) {
      S.src = id;
      renderSourceToggles();
      renderTabs();
      var list = visibleDatasets();
      if (list.length) switchTo(list[0].id, true);
      return window.__TC.state();
    },
    setDs: function (id) { switchTo(id, true); return window.__TC.state(); },
    tabs: function () {
      var box = $('tabs');
      return box ? Array.prototype.map.call(box.querySelectorAll('button'),
        function (b) { return b.textContent.trim() + (b.classList.contains('active') ? '*' : ''); }) : [];
    },
    err: null,
  };
  window.addEventListener('error', function (e) {
    window.__TC.err = String((e && e.message) || e) + ' @' + (e && e.lineno);
  });

  boot();
})();
