# 汾渭动力煤周度数据 · 季节性图谱

独立的**动力煤**季节性站点（与汾渭主站 `fenwei.pages.dev` 分开）。

## 🌐 公网地址

# **https://xujiahao88.github.io/thermal-coal/**

## 一、站点信息

| 项 | 值 |
|---|---|
| **公网地址** | **https://xujiahao88.github.io/thermal-coal/** |
| 仓库 | `xujiahao88/thermal-coal`（**public**） |
| 部署 | **GitHub Pages**（main 分支 / 根目录，push 后 1–2 分钟自动重建） |
| 数据源 | `C:\Users\Administrator\Nutstore\1\小目标\汾渭动力煤.xlsx` |
| 源表 sheet | `动力煤全样本（160家）`（365 行 × 177 列） |
| 更新频率 | 周频（每周三） |
| 版面 | **四类指标同页展示**（无 tab 切换） |

> 部署方式说明：汾渭主站走「私有库 + Cloudflare Pages」（需在 CF Dashboard 手动绑，
> 本机无 CF 凭据、无法自动化）；本站点走「公开库 + GitHub Pages」，
> 与 `juanluo-charts` / `black-series` 等同规格，可全自动部署。

## 二、四类指标

| 指标块（同页顺序） | 序列 | 列（1-based） | 频率 | 覆盖 |
|---|---|---|---|---|
| 产量 | 山西 / 陕西 / 内蒙 / 合计 | c6–c9 | 周 | 2022-01 → 2026-09 |
| 产能利用率 | 山西 / 陕西 / 内蒙 / 合计 | c10–c13 | 周 | 2022-01 → 2026-09 |
| 开工率 | 山西 / 陕西 / 内蒙 / 合计 | c14–c17 | 周 | **2024-07** → 2026-09（源表只从 2024-07-10 起统计） |
| 库存 | 山西 / 陕西 / 内蒙 / 合计 | c2–c5 | 周 | 2022-01 → 2026-09 |

> 四类指标**同页展示**，顺序即 `meta.datasets` 的顺序（产量 → 产能利用率 → 开工率 → 库存）。
> 顶部汇总表把四类指标的 本期/上期/去年同期/环比/同比 拼成一张 16 列宽表。

> 每个指标在源表另有「年份分列块」（c35 起，每块 5 列 = 2022–2026）。
> 本脚本**以主表（c1 日期列 + 指标列）为准**出图，年份分列块仅作交叉校验。
> ⚠️ c137 之后还有 6 组年份块（c145/c152/c159/c166/c173），数据不完整、含义待定，**不出图**。

## 三、一条龙

```bash
# 抽数 + 推公网（默认）
python scripts/run_pipeline.py

# 只抽数不推
python scripts/run_pipeline.py --no-push

# 只看源数据覆盖统计
python scripts/run_pipeline.py --check
```

单独调用：

```bash
python scripts/build_data.py            # 抽数（自动找最新《汾渭动力煤.xlsx》）
python scripts/push_site.py             # 推公网（幂等，无变更自动跳过）
python scripts/push_site.py --dry-run   # 只看哪些文件有变更
```

## 四、目录

```
thermal-coal-charts/
├── index.html                 站点入口（data.js 内联数据 + ?shot=1 截图模式）
├── assets/
│   ├── app.js                 ECharts 渲染引擎（季节图 / 年份开关 / 懒加载）
│   ├── style.css              样式（仿汾渭站视觉）
│   └── vendor/echarts.min.js  ECharts 5 本地版
├── data/
│   ├── meta.json              站点元信息 + xaxis(366点) + datasets
│   ├── data.js                window.__FENWEI_DATA（内联，供 file:// 直开）
│   └── {output,utilization,operating,inventory}.json
├── scripts/
│   ├── build_data.py          抽取（主表 → 季节性）
│   ├── push_site.py           推 GitHub（git-data API 直连）
│   └── run_pipeline.py        一条龙入口
└── preview/                   无头 Edge 截图（不入库）
```

## 五、关键实现细节

- **季节性轴**：X 轴固定 `01-01 … 12-31`（闰年 366 点），每年一条线，同日期对齐比较。
- **年份配色**（对齐汾渭/MS）：2022 `#FFC000`、2023 `#8a94a8`、2024 `#4BACC6`、2025 `#1f4e8c`、2026 `#FF0000`。
- **断点处理**：`maxGap=30`（周频）—— 相邻有效点间隔超过 30 天自动断开，
  避免开工率 2024 年半条线被拉成竖直长线。
- **X 轴刻度**：用月度标签（`N月`）；**不要**用 `xDayLabels`，
  因为周频数据落到 `MM-01` 的点极少，会只剩 1/1 和 6/1 两个刻度。
- **⚠️ 月份标签必须「只打每月 1 号」**（2026-09-24 修复）：
  366 点的 category 轴若逐点都返回 `N月`，ECharts 抽稀后会出现
  「01月 01月 02月 02月 …」的**重复标签**。`monthLabel()` 现已改为
  `if (p[1] !== '01') return ''`，只在每月首日打一个刻度。
- **⚠️ 4 张图必须同行**（2026-09-24 修复）：`.grid.cols-4` 原先在
  `max-width:1360px` 就降为 3 列，导致「合计」被挤到第二行、
  在 1280 宽屏上极易被误认为「合计数据没显示出来」。
  现只在 `<900px` 才降 2 列，`<560px` 才降 1 列。
- **「合计」列高亮**：汇总表每类指标的第 4 列（合计）加 `.col-total`（淡蓝底），
  环比/同比着色时也保留淡红/淡绿底，避免与前三列混看。
- **⚠️ 多层表头不要补空占位 `<th>`**（2026-09-24 修复）：
  第 1 行「指标」是 `rowSpan=2`，浏览器已让它占用第 2 行第 1 列；
  若第 2 行再补一个空 `<th>`，它会被放到**第 2 列**，导致后面 16 个地区表头
  **整体右移一列**、与数据错位（末列「合计」还会被挤出可视区）。
  `tr2` 必须直接从第一个地区表头开始。
  ⚠️ 自检时注意：**`colSpan` 之和正常 ≠ 对齐**（本坑下各行 span 和都是 17），
  必须逐格比像素 `left/right`。
- **缓存刷新**：`push_site.py` 在数据变更时会自动把 `index.html` 里
  `data/data.js?v=...` 的版本号刷成当前时间戳，防止浏览器缓存旧 tab 列表。
- **推送幂等**：先比对本地文件 git blob sha 与远程 tree，无变更不产生 commit。

## 六、部署（已完成，无需再操作）

**已上线：** https://xujiahao88.github.io/thermal-coal/

配置：仓库 public → Settings → Pages → Source = `main` / `/`（根目录）。
已通过 API 开启并构建成功（status=built）。

之后每次跑 `python scripts/run_pipeline.py` 推送数据，GitHub Pages 会自动重新构建（约 1–2 分钟）。

> **为何没用 Cloudflare Pages**：汾渭主站是「私有库 + CF Pages」，但 CF 绑定必须在
> Cloudflare Dashboard 手动点授权（本机无 CF API Token / wrangler 凭据），无法自动化。
> 因此本站点改用「公开库 + GitHub Pages」，与 `juanluo-charts`、`black-series`、
> `futures-tech-quant-dashboard`、`jianzhu-zhigong-dashboard` 同规格，可全自动部署。
> 若日后想改成私密 + CF Pages，需先在 CF Dashboard 建 Pages 项目并把仓库转回 private。

## 七、免责声明

内容由 AI 基于公开与用户数据整理，仅供参考，不构成投资建议。

---

## 附：数据完整性自检（2026-09-24）

排查「库存合计数据没显示」时的完整核验结论：

| 检查项 | 结果 |
|---|---|
| `inventory.json` 的「合计库存」序列 | **243 个非空点**，years=[2022,2023,2024,2025,2026] |
| 各年点数 | 2022=51 / 2023=52 / 2024=51 / 2025=52 / 2026=37 |
| `table.values` | [400.2, 391.8, 414.1, 8.4, -13.9]（本期/上期/去年同期/环比/同比） |
| 源表交叉校验 | 山西+陕西+内蒙 ≡ 合计（55 周逐行核验，仅 ±0.1 四舍五入差） |
| `splitSeries` 切分后数据保留 | **100% 保留**（各年均为 1 段，无丢点） |
| DOM 中 `.row-block` 数 | **4**（产量/产能利用率/开工率/库存） |
| 库存块卡片数 / canvas 数 | **4 / 4**（含「合计库存」canvas=300×260） |
| 页面 canvas 总数 | **16** |
| 汇总表列数 | **16**（4 指标 × 4 地区），`table-scroll` 无横向溢出 |
| 汇总表表头/数据像素对齐 | ✅ `header[i].left === data[i+1].left`（修复后实测一致） |

**结论**：数据与渲染均无缺失。用户感知的「合计没显示」实际由 **三处版式缺陷**造成，
已全部修复：① X 轴月份标签重复；② 1280 宽屏下 4 图被拆成 3+1 两行、「合计」落到第二行；
③ 汇总表第 2 行多补了一个空占位 `<th>`，导致地区表头整体右移一列、与数据错位。

自检脚本可复跑：读 `data/inventory.json` 的 `rows[0].charts[3]`（合计库存）
与 `meta.json` 的 `xaxis`（366 点）。
