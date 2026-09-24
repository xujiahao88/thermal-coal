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
