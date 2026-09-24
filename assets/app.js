/* 汾渭动力煤周度数据 · 季节性图谱
   数据由 scripts/build_data.py 从《汾渭动力煤.xlsx》提取 */
(function () {
  'use strict';

  var PALETTE = ['#00B0F0', '#002060', '#632523', '#F79646', '#FF0000',
                 '#9BBB59', '#8064A2', '#4BACC6', '#C0504D'];

  var S = {
    meta: null, xaxis: [],
    dsId: null, data: null,       // data = 全部数据集合并后的视图
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
    return v.toFixed(2);
  }
  function fmtAxis(v, unit) {
    if (unit === '%') return (v * 100).toFixed(0) + '%';
    if (unit === '元/吨') return Math.round(v);
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万';
    if (unit === '万吨') return Math.round(v);
    return v.toFixed(0);
  }
  // X 轴刻度：只在「每月 1 号」打一个标签，其余返回空串。
  // 关键点：366 点的 category 轴若逐点都返回「N月」，ECharts 抽稀后会出现
  // 「01月 01月 02月 02月 …」的重复标签（同一月被抽到两次），故必须只打首日。
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
    S.shot = params.get('shot') === '1';   // 截图模式：强制全量渲染，便于无头整页截图

    function mount() {
      setSubText();
      S.data = assembleAll();
      if (!S.data) {
        $('loading').innerHTML = '<div style="color:#c0392b">没有可用的数据集</div>';
        return;
      }
      S.years = collectYears(S.data);
      renderYearToggles();
      render();
      var _ld = $('loading'); if (_ld) _ld.style.display = 'none';
      if (new URLSearchParams(location.search).get('debug') === '1') dumpDebug();
    }

    // data.js 内联 → 直接用（无需异步 fetch，适合本地/无头/静态托管）
    if (window.__FENWEI_DATA && window.__FENWEI_DATA.meta) {
      S.meta = window.__FENWEI_DATA.meta;
      S.xaxis = S.meta.xaxis || [];
      mount();
      return;
    }

    // 兜底：逐个 fetch meta.json 与各数据集 json
    loadJSON('data/meta.json').then(function (meta) {
      S.meta = meta;
      S.xaxis = meta.xaxis || [];
      return Promise.all(meta.datasets.map(function (d) {
        return loadJSON('data/' + d.id + '.json').catch(function () { return null; });
      })).then(function (arr) {
        window.__FENWEI_DATA = { meta: meta };
        meta.datasets.forEach(function (d, i) { if (arr[i]) window.__FENWEI_DATA[d.id] = arr[i]; });
        mount();
      });
    }).catch(function (e) {
      $('loading').innerHTML =
        '<div style="color:#c0392b">数据加载失败：' + e.message + '</div>' +
        '<div style="margin-top:8px;color:#8a94a8;font-size:12px">' +
        '请确认 data/ 目录下已有 meta.json 或 data.js。若直接用 file:// 打开，' +
        '请使用 <code>data/data.js</code> 内联数据，或在项目目录运行 ' +
        '<code>python -m http.server 8000</code> 后访问 ' +
        '<code>http://localhost:8000</code>。</div>';
    });
  }

  // ---------------------------------------------------------- 数据集装配（单页全展示）
  //
  // 本站点把「产量 / 产能利用率 / 开工率 / 库存」四类指标**合并在一页**展示，
  // 没有 tab 切换：顶部汇总表把所有指标的 本期/上期/去年同期/环比/同比 拼成一张宽表，
  // 下面按指标块依次铺开季节图。数据集顺序即 meta.datasets 的顺序。

  function assembleAll() {
    var ids = S.meta.datasets.map(function (d) { return d.id; });
    var parts = ids.map(function (id) {
      return (window.__FENWEI_DATA && window.__FENWEI_DATA[id]) || null;
    }).filter(Boolean);
    if (!parts.length) return null;

    // 汇总表：每类指标占一组列（各 4 列）
    var tableRows = [];
    parts.forEach(function (p) { tableRows = tableRows.concat(p.rows); });

    return {
      id: 'all',
      name: '汾渭动力煤（晋陕蒙160家）',
      cols: 4,
      rows: parts.reduce(function (a, p) { return a.concat(p.rows); }, []),
      table_rows: tableRows,
      _parts: parts,
    };
  }

  function setSubText() {
    var upd = S.meta.datasets.reduce(function (a, d) {
      return (!a || d.updated > a) ? d.updated : a;
    }, '');
    var total = S.meta.datasets.reduce(function (a, d) { return a + d.count; }, 0);
    $('sub').innerHTML = '数据更新至 <b>' + upd + '</b> · 共 <b>' + total + '</b> 张图（四类指标同页展示）';
    $('footNote').textContent = '数据提取时间：' + (S.meta.generatedAt || '-') +
      ' · 来源：汾渭动力煤.xlsx（动力煤全样本160家）';
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

  // 年份小圆点的颜色：优先用数据集里该年份的真实线色，否则回落固定色板
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

  // ---------------------------------------------------------- 渲染

  function render() {
    if (S.io) { S.io.disconnect(); S.io = null; }
    disposeAll();
    var main = $('main');
    main.innerHTML = '';
    S.items = [];

    // 数据表在上（四类指标拼成一张宽表）
    main.appendChild(buildTableSection());

    // 图表在下：按指标块依次铺开，每块前加一条分隔标题
    S.data.rows.forEach(function (row) {
      main.appendChild(buildRowBlock(row));
    });

    if (S.shot) {
      // 截图模式：跳过懒加载，全部图表立即初始化并固定高度，确保整页截图不空缺
      S.items.forEach(function (it) {
        it.el.style.height = '280px';
        lazyInit(it.el);
        if (it.inst) it.inst.resize();
      });
    } else {
      observe();
      // 首屏直接初始化，避免静态打开时懒加载不触发（四类共 16 图，全部预热）
      S.items.slice(0, 24).forEach(function (it) { lazyInit(it.el); });
    }
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
        var line = c.title + ' inst=' + (!!it.inst) + ' layout=' + (c.layout || 'line') +
                   ' colors=' + (c.colors || []).join(',');
        if (it.inst) {
          var op = it.inst.getOption();
          var ya = (op.yAxis && op.yAxis[0]) || {};
          line += ' y=[' + ya.min + ',' + ya.max + ']';
          (op.series || []).forEach(function (s) {
            line += ' | ' + s.name + (s.type === 'bar' ? '[bar]' : '[line]') +
                    '(' + ((s.lineStyle && s.lineStyle.color) || '') + ')';
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
    // 单页模式下 tab 已取消，每个指标块自己就是"标题行"，标注数据区间
    var span = rowSpan(row);
    head.innerHTML =
      '<h2>' + row.name +
      (row.unit ? '<span class="unit">单位：' + row.unit + '</span>' : '') +
      (span ? '<span class="span">' + span + '</span>' : '') +
      '</h2><span class="spacer"></span>' +
      '<span class="hint">' + row.charts.length + ' 张 · 点击图例可隐藏某年</span>';
    block.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'grid';
    if (S.data && S.data.cols) grid.className += ' cols-' + S.data.cols;
    row.charts.forEach(function (cfg) {
      grid.appendChild(makeCard(cfg, row));
    });
    block.appendChild(grid);
    return block;
  }

  // 该指标块的年份覆盖区间（如「2022–2026」；开工率会显示「2024-07 起」）
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
    title.textContent = S.data.name + '周度数据';
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

    // 第二行：各地区（每类指标最后一列 = 合计，加 col-total 高亮）
    //
    // ⚠️ 这里**不要**再补一个空的占位 th！
    // 第一行的「指标」是 rowSpan=2，浏览器已把它占用了第 2 行的第 1 列；
    // 若此处再加空 th，它会被塞到第 2 列，导致后续 16 个地区表头
    // 整体右移一列、与数据行错位（表现为「标签和数据错位」）。
    var tr2 = document.createElement('tr');
    trows.forEach(function (row) {
      var n = row.charts.length;
      row.charts.forEach(function (ch, ci) {
        var th = document.createElement('th');
        th.textContent = ch.colName;
        if (ci === n - 1) th.className = 'col-total';
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
        var n = row.charts.length;
        row.charts.forEach(function (ch, ci) {
          var td = document.createElement('td');
          var v = (ch.table && ch.table.values) ? ch.table.values[ri] : null;
          td.textContent = fmtVal(v, row.unit);
          var cls = [];
          if (ci === n - 1) cls.push('col-total');
          // 环比 / 同比着色：正值红、负值绿
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
    card.className = 'card';

    var head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = '<span class="t">' + cfg.title + '</span>' +
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
    var cur = lastOf(cfg.series[n - 1]);
    var prv = lastOf(cfg.series[n - 2]);
    if (cur === null) return '最新：<b>-</b>';
    var txt = '最新：<b>' + fmtVal(cur, cfg.unit) + '</b>';
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
    if (cfg.layout === 'monthly') return buildMonthlyOption(cfg, yMin, yMax);
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
          formatter: cfg.xDayLabels
            ? function (md) {
                md = String(md);
                return md.slice(-2) === '01' ? (parseInt(md.slice(0, 2), 10) + '/1') : '';
              }
            : monthLabel,
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

  // 月度数据: 从 366 长序列里按月份取「当月最后一个有效值」（即月末点）
  function monthlyValues(series366) {
    var out = new Array(12).fill(null);
    for (var i = 0; i < series366.length; i++) {
      var v = series366[i];
      if (v === null || v === undefined || isNaN(v)) continue;
      var md = S.xaxis[i];
      if (!md) continue;
      var m = parseInt(md.split('-')[0], 10);
      if (m >= 1 && m <= 12) out[m - 1] = v;
    }
    return out;
  }

  // 月度供给结构: 柱状图 (X 轴 = 12 个月, series = 年份分组柱)
  function buildMonthlyOption(cfg, yMin, yMax) {
    var months = ['1月', '2月', '3月', '4月', '5月', '6月',
                  '7月', '8月', '9月', '10月', '11月', '12月'];
    var series = [];
    var maxYear = Math.max.apply(null, cfg.years);
    var nLabel = cfg.labelMonths || 0;
    var labelSet = {}, dashIdx = -1;
    if (nLabel || cfg.dashLast) {
      var ci = cfg.years.indexOf(maxYear);
      if (ci >= 0) {
        var cv = monthlyValues(cfg.series[ci]);
        var nz = [];
        for (var k = 0; k < cv.length; k++) if (cv[k] !== null && cv[k] !== undefined) nz.push(k);
        for (var t = Math.max(0, nz.length - nLabel); t < nz.length; t++) labelSet[nz[t]] = 1;
        if (cfg.dashLast && nz.length) dashIdx = nz[nz.length - 1];
      }
    }
    cfg.years.forEach(function (y, i) {
      if (S.hidden[y]) return;
      var color = seriesColor(cfg, i);
      var isCurrent = (y === maxYear);
      var vals = monthlyValues(cfg.series[i]);
      var data = vals;
      if (isCurrent && (nLabel || cfg.dashLast)) {
        data = vals.map(function (v, mi) {
          if (v === null || v === undefined) return v;
          var o = { value: v };
          if (labelSet[mi]) {
            o.label = { show: true, position: 'top', fontSize: 9, color: '#5a657c',
                        formatter: function (p) { return (+p.value).toFixed(1); } };
          }
          if (mi === dashIdx) {
            o.itemStyle = { borderColor: '#FF0000', borderWidth: 1.3, borderType: 'dashed' };
          }
          return o;
        });
      }
      series.push({
        name: String(y), type: 'bar', data: data,
        itemStyle: { color: color }, barMaxWidth: 20,
        emphasis: { focus: 'series' }, z: isCurrent ? 10 : 2,
      });
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
        axisPointer: { type: 'shadow' },
        formatter: function (ps) {
          if (!ps || !ps.length) return '';
          var h = '<div style="font-weight:600;margin-bottom:3px">' + ps[0].axisValue + '</div>';
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
        type: 'category', data: months,
        axisLine: { lineStyle: { color: '#c9d1e0' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, color: '#8a94a8' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', scale: !(S.zero || cfg.zeroBase), min: yMin, max: yMax,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { fontSize: 10, color: '#8a94a8', formatter: function (v) { return fmtAxis(v, unit); } },
        splitLine: { lineStyle: { color: '#eef1f7' } },
      },
      series: series,
    };
  }

  // 同行统一 Y 轴范围
  function rowRange(row) {
    var lo = Infinity, hi = -Infinity, anyZero = false;
    row.charts.forEach(function (cfg) {
      if (cfg.zeroBase) anyZero = true;
      cfg.years.forEach(function (y, i) {
        if (S.hidden[y]) return;
        var a = cfg.series[i] || [];
        if (cfg.layout === 'monthly') a = monthlyValues(a);
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
      if (cfg.layout === 'monthly') a = monthlyValues(a);
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
    });  }

  bindUI();
  boot();
})();
