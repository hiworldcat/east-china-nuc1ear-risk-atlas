# 分阶段提交计划

> 目标：把已经完成的项目拆成 **8 个有意义的提交**，让仓库历史能看出“数据 → 模型 → 前端 → 水系/路网 → 文档”的完善过程。

## 先说清楚：关于“刷贡献”

GitHub 的贡献图是**按天**统计的，不是按 commit 数量：

- 同一天提交 8 次，贡献图只显示 **1 天**，颜色会深一点；
- 想出现多天，只能在不同日期真实提交；
- **不建议用 `--date` 伪造历史日期**，也不建议空提交，这会让仓库历史失真，别人也能看出来。

所以下面这套方案是“真实的分阶段提交”，用于展示项目结构；如果想拉长贡献图，正确做法是后续按阶段继续完善、分天提交。

## 0. 准备

```powershell
winget install --id Git.Git -e --source winget
# 重新打开 PowerShell
git --version

cd "C:\哔站账号管理-爱吃三文鱼的\视频素材\核战生存地图"

git config --global user.name "你的名字"
git config --global user.email "你的邮箱"

git init -b main
git remote add origin https://github.com/hiworldcat/east-china-nuc1ear-risk-atlas.git
```

> 如果远程仓库已有 README，先删掉重建空仓库，或者最后用 `git pull --rebase origin main --allow-unrelated-histories` 合并。

## 1. 仓库规范

```powershell
git add .gitignore GIT_PUSH_GUIDE.md GIT_COMMIT_PLAN.md
git commit -m "docs: 初始化仓库规范与提交计划"
```

## 2. 行政边界与人口

```powershell
git add scripts/fetch_geo.mjs scripts/merge_pop.mjs
git add data/raw/east_china_counties_raw.geojson
git add data/raw/east_china_counties_pop.geojson
git add data/raw/east_china_cities.json
git add data/raw/census_county.csv
git commit -m "feat(data): 抓取华东七省 625 个县级边界与七普人口"
```

## 3. 地形与邻省上下文

```powershell
git add scripts/fetch_elevation.mjs data/raw/elevations.json
git add scripts/fetch_context.mjs data/context.js
git commit -m "feat(terrain): 采样 SRTM 地形并加入邻省地理上下文"
```

## 4. 风险模型与目标清单

```powershell
git add assets/risk.js
git add data/model/targets.json data/model/industry_additions.json
git add data/targets.csv
git add scripts/build_db.mjs
git commit -m "feat(model): 构建 307 个目标节点与县级风险评分模型"
```

## 5. 县级数据库与撤离方案

```powershell
git add data/database.js data/summary.json
git add data/county_database.csv data/city_summary.csv
git add data/counties_scored.geojson
git commit -m "feat(data): 导出县级风险数据库、城市汇总与撤离方案"
```

## 6. 地图前端

```powershell
git add index.html
git add assets/app.css assets/app.js
git add assets/leaflet
git commit -m "feat(ui): 实现可交互风险地图、搜索、详情与数据库"
```

> 这一阶段的 `index.html` 已经预留了水系/路网脚本，但数据还没提交；代码里有 `if (!H) return` 之类的空值保护，所以页面仍可运行，只是暂时没有水系/路网图层。

## 7. 河流、湖泊、高速与国道

```powershell
git add scripts/build_hydro.mjs scripts/fetch_roads.mjs
git add data/hydro.js data/roads.js
git add data/raw/ne_rivers.geojson data/raw/ne_lakes.geojson
git commit -m "feat(layers): 增加河流湖泊与高速国道走廊"
```

## 8. 文档、预览与启动脚本

```powershell
git add README.md
git add preview
git add "启动地图.cmd"
git commit -m "docs: 补充预览图、使用说明与启动脚本"
```

## 9. 检查并推送

```powershell
git status
git log --oneline --graph --decorate -10
git push -u origin main
```

如果最后 `git status` 还有未跟踪文件，先看是什么，再决定是否补进第 8 个提交：

```powershell
git status --short
```

## 提交后的历史应该类似

```text
docs: 补充预览图、使用说明与启动脚本
feat(layers): 增加主要河流湖泊、高速与国道图层
feat(ui): 实现可交互风险地图、搜索、详情与数据库
feat(data): 导出县级风险数据库、城市汇总与撤离方案
feat(model): 构建 307 个目标节点与县级风险评分模型
feat(terrain): 采样 SRTM 地形并加入邻省地理上下文
feat(data): 抓取华东七省 625 个县级边界与七普人口
docs: 初始化仓库规范与提交计划
```

## 备注

- 这是一次**回溯拆分**：每个中间提交不一定是完整可运行的版本，目的是让文件结构和开发阶段清晰；最后一个提交才是完整项目。
- 如果希望每个 commit 都可运行，需要为每个阶段保存一份可运行快照；当前项目已经完成，拆分成本较高。
- 真正适合“持续贡献”的方式，是以后每完成一个功能就提交一次，例如：新增一个城市、补充一类化工企业、修正一个评分参数、增加一个图层，而不是一次性补历史。
