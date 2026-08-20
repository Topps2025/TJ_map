# TJ_map 交接说明 · 明天开工必读

> 写给下一个 agent（2026-08-17 开工）。今天（08-16）的工作总结见同目录 `DEVELOPMENT_LOG.md`，本文件只讲"明天怎么接手、注意什么"。

---

## 一、哪个是主工作区

**主工作区：`C:\Users\12481\Desktop\project\TJ_map`**
- 这是一个 **Flask + SQLite** 的"猫和老鼠手游点位查询"网站（三级联动：分类 → 地图主题 → 具体地图 → 点位网格）
- 前台模板 `templates/index.html`，后台 `templates/admin_login.html` + `templates/admin_dashboard.html`
- 样式 `static/css/style.css`（简约中性主题），逻辑 `static/js/main.js`
- 数据库 `database.db`（首次启动自动创建），图片上传目录 `static/originals/`、`static/thumbs/`

**素材/参考仓库：`C:\Users\12481\Desktop\project\Tom-and-jerry-chase-wiki`（tjwiki）**
- 不要修改这个仓库，它只作为**数据与图片来源**：
  - 地图数据：`src/data/maps.ts`（真实地图名、主题族、娱乐地图清单）
  - 地图静态图：`public/images/maps/`（缩略图 1:1 正方形 + `-地图.png` 整图）
- 若用户后续提供"具体架构"目录，需与 tjwiki 数据对照后调整

## 二、明天的主要任务（用户已预告）

**给各个点位配上老鼠插图（角色/头像插图）** —— 具体素材和形式用户还没定，**开工先向用户确认**：
- 插图放哪（tjwiki `public/images/` 下的角色图？还是别处）
- 点位卡片怎么展示插图（点位缩略图旁/代替缩略图/图标角标）
- 哪些角色、什么尺寸

## 三、环境与运行（重要）

- Python 3.14.2（全局 `python` 可用）
- **沙箱里不能直接 `pip install`**（pip 写临时目录会被沙箱拦截）。已备好离线依赖目录 **`.pylibs/`**（含 flask 3.1.3 等），运行方式：
  ```powershell
  $env:PYTHONPATH = "C:\Users\12481\Desktop\project\TJ_map\.pylibs"
  python -u "C:\Users\12481\Desktop\project\TJ_map\app.py"
  ```
  - 若 `.pylibs` 缺失/损坏，用 `python .fetch_deps.py` 重新下载解压（脚本在工作区内，已 gitignore）
- 默认端口 **5000**。⚠️ **用户本机可能还跑着旧服务器进程占着 5000**（之前遇到过，用户需自己重启才能看到新效果）。验证新代码时**优先用 5001/5002/5003** 等端口，不要去杀用户进程：
  ```powershell
  $env:PYTHONPATH = "...TJ_map\.pylibs"; python -c "import sys; sys.path.insert(0, r'...TJ_map'); import app; app.app.run(port=5001)"
  ```
- `config.py` 已创建（gitignore，不入库）：后台账号 `admin/admin123`，可用环境变量覆盖
- 演示数据：`python seed_demo.py` 生成 12 条占位点位

## 四、代码结构速览

- `app.py`：
  - `L1_CATEGORIES` = 4 个分类（挂机果盘 / **炸药桶** / 投掷物点投 / 罗宾汉泰菲种树）—— 几何桶+隔墙炸已合并为炸药桶，带 `L1_CATEGORY_MIGRATE` 旧数据迁移
  - `L2_GROUPS` = 11 个主题组（经典之家/雪夜古堡/夏日游轮/太空堡垒/游乐场/森林牧场/大都会/熊猫馆/御门酒店/天宫/娱乐地图）
  - `get_map_images()`：地图名 → `{thumb, full}`（变体 I/II/III 继承主题族缩略图）
  - API：`/api/categories` `/api/groups` `/api/maps`（返回 `{name, thumb, full}`）`/api/points` `/api/submit`，后台 `/admin/*`
- 前端地图卡片：`.map-card` + `.map-card-thumb`（**1:1 正方形**）+ `.map-card-name`；点位区整图横幅 `.map-banner`
- 前端角色说明：`static/js/main.js` 渲染主题/地图卡片、横幅、点位网格、投稿弹窗

## 五、设计约定（改动前端时务必遵守）

- **简约中性风格**，参考 tjwiki 设计语言：浅灰底 `#f5f5f7`、白卡片、细边框 `#e4e4e7`、中性文字，唯一强调色 `--accent: #2563eb`。**不要大红大紫**
- 地图卡片必须**等高整齐**：图片区用 `padding-top: 100%` 等比容器 + 绝对定位 `img`（`object-fit: cover`），无图时渲染 `.map-card-placeholder` 占位——**不要用 aspect-ratio + height:100% 组合**（会导致高低不齐）
- 缩略图源图是 **1:1 正方形**，卡片图片区 1:1 才不会裁剪
- 整图横幅 `object-fit: contain`（整图比例 1.26~4.34 差异大，cover 会截断）
- 改前端后需**重启服务器**才生效；刷新页面看效果

## 六、Git 状态

- 远端：`git@github.com:Topps2025/TJ_map.git`（origin/main）
- 今天已提交并推送：`142c49c feat: 补全三级联动地图数据并重做简约前端`（工作树干净）
- 明天开工先 `git pull` 确认远端最新
- 注意：沙箱里 git push 需 `$env:GIT_SSH_COMMAND = "C:/Windows/System32/OpenSSH/ssh.exe"` 且可能需要提升权限（MSYS ssh 在沙箱下无法建管道）

## 七、沟通约定

- 需求模糊时**先向用户询问**（用户明确要求过）；用户若再次提到"具体架构"目录，先找 `TJ_map` 根目录下是否有该目录/文件再动手
- 大改动前先说明方案；改动后汇报文件清单
