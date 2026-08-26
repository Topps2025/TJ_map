# TJ_map 开发日志 · 2026-08-16

> 本文件记录 TJ_map（猫和老鼠手游点位查询）的开发进展，按日期追加。

---

## 2026-08-16（第一天）

### 背景

- 主工作区：`TJ_map`（Flask + SQLite 点位查询网站，三级联动：分类 → 地图主题 → 具体地图）
- 参考仓库：`Tom-and-jerry-chase-wiki`（tjwiki，已 clone 到本机，地图数据与静态图片的权威来源）
- 用户原计划提供"具体架构"目录作为实现依据，但目录未创建成功；经确认改为**直接以 tjwiki 仓库数据为准**实现

### 一、补全三级联动地图数据（app.py）

- 第一层分类（`L1_CATEGORIES`）：由 5 个合并为 **4 个**
  - 删除"几何桶点位"、"莱恩隔墙炸点位"，合并为 **"炸药桶点位"**
  - 保留：挂机果盘点位、投掷物点投点位、罗宾汉泰菲种树点位
  - 新增 `L1_CATEGORY_MIGRATE` 迁移映射，`init_db()` 时自动把库里旧分类数据改写到"炸药桶点位"（已用临时库验证）
- 第二层地图主题（`L2_GROUPS`）：5 组扩为 **11 组**
  - 经典之家 / 雪夜古堡 / 夏日游轮 / 太空堡垒（各 I、II、III，补齐之前缺失的 III）
  - 游乐场 / 森林牧场 / 大都会 / 熊猫馆 / 御门酒店 / 天宫（含 天宫-云上）
  - **娱乐地图** 组：经典之家-疯狂奶酪赛、雪夜古堡-疯狂奶酪赛、金丝雀之家、熊猫馆-烟花大作战、阳光沙滩、后院、5V5大都会、家之典经、经典之家-谁是外星人
- 地图命名统一为 tjwiki 真实命名（罗马数字 I/II/III，替代原"经典之家1/2/3"）

### 二、地图静态图片（自 tjwiki 复制 33 张 → static/images/maps/，共约 7.7MB）

- 缩略图（主题图）：如 `经典之家.png`、`雪夜古堡.png`，全部为 1:1 正方形（120/256px）
- 整图（`-地图.png`）：如 `经典之家I-地图.png`，比例 1.26 ~ 4.34 不等，仅常规地图有，娱乐地图无整图
- `app.py` 新增 `get_map_images()` 映射（变体地图 I/II/III 继承主题族缩略图）
- `/api/groups`、`/api/maps` 现在返回 `{name, thumb, full}` 结构

### 三、前端重做（简约中性风格，参考 tjwiki 设计语言）

- 弃用原偏鲜艳蓝色系 → 浅灰底 `#f5f5f7`、白卡片、细边框 `#e4e4e7`、中性文字，唯一强调色为克制的 `#2563eb`
- `index.html`：头部重组（左侧 logo+副标题、右侧"后台"入口），点位区新增地图整图横幅容器
- `style.css`：整体换肤；后台页、登录页共用样式表自动继承新风格
- `main.js`：第二层（主题）、第三层（具体地图）由文字 chip 改为**带缩略图的地图卡片网格**，选中地图后点位区顶部展示整图横幅
- 投稿弹窗、后台批量上传下拉适配新 API 结构（取 `x.name`）
- 修复 1：卡片高度不齐 → 图片区改用 `padding-top` 等比容器 + 绝对定位图片 + 无图占位块
- 修复 2：缩略图显示不完全 → 卡片图片区 1:1 正方形（匹配正方形主题图，零裁剪）；整图横幅改 `object-fit: contain` 完整显示

### 四、其他

- 新建 `config.py`（被 .gitignore 排除但 app 依赖，缺失导致无法启动）：含密钥、上传限制、后台账号（admin/admin123）、邮件通知默认关闭，支持环境变量覆盖
- `.gitignore` 追加 `.pylibs/`、`.pip-tmp/`、`.wheels/`、`.fetch_deps.py`（沙箱测试辅助目录）
- 本地验证：/api/categories、/api/groups、/api/maps、静态图、迁移逻辑均通过（验证服务器曾因旧进程占用 5000 端口改用 5001/5002/5003 端口测试）

### 五、待办 / 注意事项

- [ ] 给各个点位配上老鼠插图（用户计划，本次未做；点位卡片结构未动，后续加插图不影响）
- [ ] 模仿 tjwiki 前端风格、利用其静态图片进一步开发（整体方向已确认，本轮已开始）
- **用户操作提醒**：本机 5000 端口旧服务器进程需手动重启（`python app.py`）才能看到新效果；旧演示数据会自动迁移到"炸药桶点位"
- 运行方式：`pip install -r requirements.txt` → `python seed_demo.py`（可选）→ `python app.py` → 打开 http://127.0.0.1:5000

### 本次提交

- 提交信息：`feat: 补全三级联动地图数据并重做简约前端`
- 涉及文件：
  - `app.py`（分类合并、地图数据、图片映射、API、迁移）
  - `config.py`（新建）
  - `static/css/style.css`、`static/js/main.js`、`templates/index.html`、`templates/admin_dashboard.html`
  - `static/images/maps/`（33 张图片，新增）
  - `.gitignore`

---

## 2026-08-16（第二轮 · 后台管理与点位展示优化）

### 一、后台新增硬删除功能（app.py + admin_dashboard.html）

- 新增 `POST /admin/delete/<id>`（`@admin_required` 保护）：删除数据库记录并物理删除关联图片文件，不发邮件（区别于"拒绝"流程）
- 后台卡片（待审核 / 已审核标签）均新增「删除」按钮，带 confirm 确认
- 顺手修复 `admin_reject` 未鉴权的历史漏洞（补上 `@admin_required`）

### 二、清理 untitle 演示投稿（数据操作）

- 删除全部 `title = 'untitle'` 的投稿（12 条，id 1–12，均为 seed_demo.py 生成的演示数据）
- 同步清理其关联的 `demo_*.webp` 图片文件（originals + thumbs）
- 库中保留 3 条真实投稿（右卧室墙缝 / 客舱上甲板 / 庭院上卧室）

### 三、移除后台批量上传功能

- 删除 `POST /admin/bulk_upload` 接口、后台「批量上传」标签页、表单及全部相关 JS
- 保留「全部通过」（`/admin/approve_all`）
- 验证：`/admin/bulk_upload` 返回 404，后台页面无 bulk 残留引用

### 四、点位卡片展示修复（style.css）

- 点位卡片原为固定 1:1 正方形 + `object-fit: cover`，非正方形 PNG 会被裁切
- 改为随图片自然宽高比自适应：`.thumb-wrap img { width:100%; height:auto; object-fit:contain }`，网格加 `align-items: start`，整图完整显示不裁切

### 五、其他

- 验证：服务器重启后 `/` 200；删除接口未登录 302 跳登录、不存在 id 返回 404；`/admin/approve_all` 正常
- 本地 `database.db` 为运行时数据，删除操作不产生 git 变更

### 本次提交

- 提交信息：`feat: 后台支持删除点位并移除批量上传，点位卡片自适应图片比例`
- 涉及文件：
  - `app.py`（删除接口、reject 鉴权、移除 bulk_upload）
  - `templates/admin_dashboard.html`（删除按钮、移除批量上传 UI/JS）
  - `static/css/style.css`（点位卡片自然宽高比）
  - `DEVELOPMENT_LOG.md`（本日志）
  - 上一轮遗留已暂存：前端重做、分类图标、主题切换等（一并提交）

---

## 2026-08-16（第三轮 · 移除娱乐地图大类）

### 变更

- `L2_GROUPS` 删除「娱乐地图」组（9 张娱乐地图：经典之家-疯狂奶酪赛、雪夜古堡-疯狂奶酪赛、金丝雀之家、熊猫馆-烟花大作战、阳光沙滩、后院、5V5大都会、家之典经、经典之家-谁是外星人），现为 **10 个主题组**
- `app.py` 删除 `_FUN_THUMBS` 映射，`get_map_images()` 相应简化（全部地图均含整图 `-地图.png`）
- 删除 3 张仅娱乐地图使用的静态图：`金丝雀之家.png`、`阳光沙滩.png`、`经典之家-疯狂奶酪赛.png`（其余娱乐地图缩略图复用的主题图保留）
- 数据库无娱乐地图点位数据，无需迁移

### 本次提交

- 提交信息：`feat: 移除娱乐地图大类`
- 涉及文件：`app.py`、`static/js/main.js`（注释）、`static/images/maps/`（删 3 图）、`HANDOFF.md`、`DEVELOPMENT_LOG.md`

---

## 2026-08-17（第四轮 · 标签 / gitignore / 图标 / 拒绝原因）

### 一、投稿描述支持 #标签

- `app.py` 新增 `_extract_tags()`：从描述中提取 `#标签`（如 `#果盘 #墙角`），去重、保持顺序，空格分隔存入 `tags` 列
- 投稿（`/api/submit`）与后台编辑（`/admin/edit`）都会重新提取标签
- 前端点位卡片把 tags 渲染为 `#` 前缀的简约 chip（`.tag-chip`，浅色圆角胶囊）
- 投稿弹窗描述框 placeholder 提示可用 `#标签`

### 二、静态资源入库，投稿数据保持 ignore

- 审计确认：css/js/字体/地图与分类图片等静态资源全部已入库（originals/thumbs 之外无 ignore）
- 补齐缺失的 `static/originals/.gitkeep`、`static/thumbs/.gitkeep` 并入库（投稿数据仍被 ignore）
- `.gitignore` 补充注释明确：仅忽略投稿数据（上传图片）

### 三、网页图标

- 三个模板（index / admin_login / admin_dashboard）均添加 `<link rel="icon">` → `static/images/mice/莱恩.png`

### 四、拒绝投稿可注明原因

- `/admin/reject/<id>` 接受可选 `reason` 表单字段，写入"未通过审核"邮件（`send_submitter_email` 增加 `reason` 参数）
- 后台「拒绝」按钮先弹窗询问拒绝原因（可留空），随请求提交

### 五、验证

- 投稿含 `#果盘 #墙角 #果盘` → tags 存为 `果盘 墙角`（去重）
- 后台编辑描述后 tags 同步更新；拒绝邮件正文在有/无原因两种情况下均正确
- `/admin/reject` 带 reason 实测返回成功；favicon 路由 200

---

## 后端审查与重构（交互逻辑修正 + 去重，分支 refactor/backend-interaction-review）

> 先 `git fetch --all` + 拉取远端，再从 `feat/tjwiki-card-redesign` 切出本分支，仅动后端 `app.py`（前端未改）。

### 一、交互逻辑修正（真实缺陷）

1. **`process_image` 在 Windows 生成含反斜杠的图片 URL**
   - 原实现 `"/static/" + thumb_path.split("/", 1)[1]`：`thumb_path = os.path.join("static/thumbs", name+".png")` 在 Windows 上为 `static/thumbs\xxx.png`，split 后拼出 `/static/thumbs\xxx.png`，靠浏览器自动归一化才不裂图，移植性差。
   - 改为直接 `f"/{config.THUMBS_DIR}/{name}.png"` / `f"/{config.ORIGINALS_DIR}/{name}.png"`，纯正斜杠、与操作系统无关。
2. **`admin_required` 鉴权失败对后台 JSON 接口返回 302 而非 JSON 401**
   - 原仅对 `/api/*` 与 `/admin/pending` 回 JSON 401，其余 `/admin/approve|reject|delete|edit|approve_all` 会 302 跳登录页；前端 `fetch` 跟随重定向拿到 HTML、`res.json()` 抛错，表现为“操作失败”而非“未登录”，与 `/admin/pending` 已有 401 处理不一致。
   - 抽出 `_admin_request_is_json()`：除 `/admin`（登录页）与 `/admin/dashboard`（后台页）两个页面路由走重定向外，其余 `/admin/*` 与 `/api/*` 一律回 JSON 401。
3. **`get_map_images` 的 `full` 恒为非空，缺图时前端显示裂图横幅**
   - 原 `full = f"{map_name}-地图.png"` 恒真，返回值永远带 URL；前端 `showPoints` 据 `info.full` 真值决定是否显示横幅，故任意新增无整图的地图都会裂图。
   - 新增 `_map_asset()`：基于 `os.path.exists` 校验，缺失则返回空串，前端据此隐藏横幅/占位；`thumb` 同样走该校验。当前 19 张整图齐备，无可见变化，仅为后续扩展兜底。
4. **`api_points` 多地图匹配由 `instr(json_quote)` 子串匹配改为 `json_each` 精确匹配**
   - 原依赖 `instr(maps, json_quote(?))` 在 JSON 串里找带引号子串，逻辑脆弱；改用 `EXISTS (SELECT 1 FROM json_each(maps) WHERE value = ?)` 精确匹配数组元素，彻底消除子串误命中的隐患。

### 二、去重（消除臃肿）

- 抽出 `_validate_submission(form)`：`/api/submit` 与 `/admin/edit` 原各有一份 ~40 行近乎逐字相同的校验（分类/主题/地图多选/标题/描述/投稿人/邮箱 + 去重 + tags 提取），合并为单一来源，两处各自只剩调用 + 图片相关逻辑。
- 抽出 `_serialize_point(row, include_email)`：`/api/points`（剔除邮箱）与 `/admin/pending`（保留邮箱）原各有一段 images/maps 解析，合并；以 `include_email` 区分前台/后台是否泄露 `submitter_email`。
- 移除冗余的 `/static/originals/<path>` 与 `/static/thumbs/<path>` 自定义路由：Flask 默认已对 `static/` 目录提供 `/static/<path:filename>` 服务，二者等价，属重复代码；同时清理未用导入 `io`、`send_from_directory`。
- 将 `_THEME_THUMBS["天宫-云上"] = ...` 的后置赋值并入字典字面量。

### 三、验证（Flask test client + 临时库，不碰真实 database.db）

- `/api/categories`、`/api/groups`、`/api/maps`、`/api/points` 200 且结构正确（thumb/full 齐备）。
- 鉴权一致性：`/admin/pending`、`/admin/approve/<id>`、`/admin/delete/<id>` 未登录均回 401 JSON；`/admin/dashboard` 未登录回 302 → `/admin`；登录后 `/admin/pending` 200。
- `get_map_images`：存在地图返回路径，不存在地图返回 `{"thumb":"","full":""}`。
- `_validate_submission`：有效返回 payload（含 maps 去重保序、主地图取首个）；无效邮箱/分类返回对应错误。
- `process_image`：返回 URL 无反斜杠（Windows 关键），临时图片已清理。
- `json_each` 多地图：一条 `maps=["经典之家II","经典之家III"]` 的点位，按 `l3=经典之家I/II/III` 各命中 1 条，`l3=游乐场` 命中 0 条（精确无误命中）。
- `/api/submit` 无图回 400。
- 默认静态服务确认：移除自定义路由后 `/static/css|js|images/...` 仍 200。
- `python -m py_compile app.py` 通过。

### 四、未改动的已知点（产品/范围决策，留待后续）

- `/admin/approve_all` 批量通过不发邮件（区别于单条 approve），属既有产品取舍，未改。
- 状态变更 POST 接口无 CSRF 令牌；Flask session cookie 浏览器默认 SameSite=Lax 已提供基础缓解，完整 CSRF 防护需前后端协同，超出“重构后端”范围，未引入。
- `config.THUMB_QUALITY` 当前未使用（PNG 无质量参数），未动配置。

