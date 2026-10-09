# 猫和老鼠手游点位查询（TJ_map）

一个基于 **Flask + SQLite** 的《猫和老鼠》手游点位查询网站。玩家可以按 **分类 → 地图主题 → 具体地图** 三级联动浏览点位（挂机果盘、炸药桶、投掷物点投、罗宾汉泰菲种树等），并在线投稿带截图的新点位，管理员审核通过后展示。

## 功能特性

- **三级联动浏览**：分类（L1）→ 地图主题（L2）→ 具体地图（L3），点位以网格卡片展示
- **点位投稿**：支持一次上传最多 9 张图片（PNG/JPG/JPEG/WEBP/GIF/BMP），自动转 PNG 并生成缩略图；投稿需填写标题、投稿人、邮箱
- **后台管理**：登录审核，支持单个通过/拒绝/删除/编辑，以及一键全部通过；拒绝/删除会同时清理图片文件
- **邮件通知**：投稿后自动通知管理员，并向投稿人发送「已收到 / 已通过 / 未通过」邮件（QQ SMTP，失败静默不影响主流程）
- **深色模式**：跟随系统偏好，可手动切换并持久化到 localStorage
- **简约前端**：原生 HTML/JS/CSS，无构建步骤，运行无需 Node 环境

技术栈：Flask 2.x / 3.x（`app.py` 入口，`backend/` 按职责拆分）+ SQLite（`database.db`，启动自动建库，无 ORM）+ Pillow（原图 ≤1600px、缩略图宽 400px，统一转 PNG）+ 原生 JS/CSS + flask-cors。

## 项目结构

```
TJ_map/
├── app.py                  # 应用及启动入口（app:app、app.init_db()）
├── backend/                # catalog 数据与图标、database 建库与旧数据迁移、points 投稿
│                           # 校验序列化、images 图片转换与清理、mail 邮件通知、auth 鉴权、
│                           # routes_pages/public/admin 路由、paths 项目根目录解析
├── config.py               # 配置，被 gitignore，需自行创建（见「配置文件」）
├── requirements.txt        # Python 依赖
├── tests/                  # 后端 unittest 与前端 node --test 回归测试
├── static/
│   ├── css/                # style.css 为唯一入口，@import 引入其余样式文件
│   ├── js/                 # 前台 main.js、后台 admin.js 各自组装模块
│   ├── fonts/              # InterVariable 字体
│   ├── images/maps|mice/   # 地图静态图、分类老鼠图标（已入库）
│   └── originals|thumbs/   # 投稿原图与缩略图（gitignore，保留 .gitkeep）
└── templates/              # 纯 HTML 模板（无 Jinja）
```

## 快速开始（本地运行）

要求：Python 3.8+（开发环境已验证 3.14）。

```bash
git clone git@github.com:Topps2025/TJ_map.git && cd TJ_map
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp config.example.py config.py     # 见下文「配置文件」
python app.py                      # 首次启动自动建库、创建图片目录
```

访问 `http://127.0.0.1:5000`。服务监听 `0.0.0.0:5000`，内网其他机器可直接访问。

## 配置文件

> `config.py` 被 `.gitignore` 排除、**不随仓库分发**，但 `app.py` 在导入时强依赖它——**缺少 `config.py` 应用无法启动**。复制仓库根目录的 `config.example.py` 即可，每一项都带中文注释。

上线前务必修改：

| 配置项 | 说明 |
| --- | --- |
| `SECRET_KEY` | Flask session 密钥，换成随机值 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 后台登录账号与密码 |
| `SMTP_PASSWORD` | QQ 邮箱授权码，非登录密码 |
| `MAX_UPLOAD_SIZE` | 单次上传上限（默认 10MB），须小于 Nginx 的 `client_max_body_size` |

其余项（数据库路径、缩略图宽度、原图/缩略图目录、SMTP 地址与邮件主题等）见 `config.example.py`。`SMTP_ENABLED` 默认为 `True`，但邮件发送失败会**静默吞掉异常**，不影响页面流程——不要依赖邮件作为唯一通知手段。

## 部署（Gunicorn + systemd + Nginx）

应用是标准 WSGI 应用（`app:app`），可按常规 Flask 方式部署。

**① 安装依赖**

```bash
python -m venv /opt/tj_map/.venv
source /opt/tj_map/.venv/bin/activate
pip install -r requirements.txt gunicorn
```

**② 初始化数据库并创建上传目录**：`init_db()` 只在 `python app.py`（`__main__`）时自动执行，用 Gunicorn 导入时**不会**自动建库，需手动执行一次。

```bash
cd /opt/tj_map
mkdir -p static/originals static/thumbs
.venv/bin/python -c "import app; app.init_db()"
```

**③ 创建 systemd 服务** `/etc/systemd/system/tj_map.service`

```ini
[Unit]
Description=Tom & Jerry spot lookup (TJ_map)
After=network.target

[Service]
Type=simple
User=tjmap
WorkingDirectory=/opt/tj_map
ExecStart=/opt/tj_map/.venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 60 app:app
Restart=always
# 确保运行用户对 static/originals、static/thumbs 有写权限

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tj_map
```

**④ Nginx 反向代理** `/etc/nginx/sites-available/tj_map`

```nginx
server {
    listen 80;
    server_name tjmap.example.com;

    client_max_body_size 20m;   # 需大于 MAX_UPLOAD_SIZE，否则图片上传会被 Nginx 直接拒绝

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tj_map /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

如需 HTTPS，可用 Certbot 签发证书。

**部署要点**

- 上传图片经 `/static/originals/`、`/static/thumbs/` 两个显式 Flask 路由提供（不依赖 Nginx alias），需确保应用进程可读写这两个目录；`client_max_body_size` 必须大于 `MAX_UPLOAD_SIZE`；务必修改 `SECRET_KEY` 与 `ADMIN_PASSWORD`
- 数据库是单文件 SQLite，建议定期备份 `database.db`（停服时复制，或用 `sqlite3 database.db ".backup bak.db"`）
- **更新部署**：保留服务器的 `config.py`（尤其是 `SECRET_KEY`）、`database.db` 和上传图片目录，同步全部新增模块及静态文件——须同步整个 `backend/` 目录，不能只替换 `app.py`
- **数据库迁移**：迁移前先备份，在停止服务写入后执行 `init_db()`，成功后再启动服务——单纯重启 Gunicorn 不执行迁移
- **重启后验证**：检查 `systemctl is-active tj_map`、`journalctl -u tj_map -n 100 --no-pager`，并通过实际域名验证首页、`/api/categories`、`/api/points`、后台登录及已有图片；单实例 `systemctl restart` 期间可能有短暂不可用

## 维护

### 后端与数据

- 分类数据集中在 `backend/catalog.py`：`L1_CATEGORIES` 一级分类、`L1_CATEGORY_ICONS` 分类图标、`L1_CATEGORY_INFO` 分类介绍页文案、`L2_GROUPS` 二级主题 → 三级地图映射、`L1_CATEGORY_MIGRATE` 历史分类改名迁移（启动时自动改写存量数据）。改数据改字典，不动模板
- 地图清单与命名以 `Tom-and-jerry-chase-wiki` 仓库（`src/data/maps.ts`）为权威来源，**不要凭空发明地图名**；地图静态图来自其 `public/images/maps/`，`static/images/mice/*.png` 分类图标已入库
- 路由模块通过 `register_routes(app)` 注册，保留原有 URL、端点名称、登录会话和响应格式；模板、静态资源、数据库及上传目录仍相对于项目根目录解析
- 其他 schema 变更无迁移工具：`init_db()` 只能自动**新增列**（`PRAGMA table_info` + `ALTER TABLE`），改动或删除列需编写专项迁移，备份后在停写状态下执行并验证数据

### 前端

- 前台使用浏览器原生 ES Modules，由 `index.html` 的 `type="module"` 脚本加载 `main.js`，无构建步骤；改动 `static/` 后刷新页面；修改 `templates/` 时，当前非调试配置下需重启应用以清除模板缓存。请通过 Flask 提供的 HTTP 地址访问页面
- `main.js` 只负责创建模块、连接回调和启动。浏览层级状态保存在 `browse.js`；投稿模块通过 `getContext()` 获取快照、`onSubmitted()` 通知浏览模块刷新；灯箱与投稿各自保存交互状态，历史标记统一交给 `navigation.js` 管理，避免关闭弹窗时误退页面。各模块导入时不绑定事件，事件在对应的 `create*` 初始化函数中绑定一次
- 改点位展示看 `points.js`，改投稿流程看 `submission.js`，改图片上传交互看 `image-picker.js`；后台审核页由 `admin.js` 组装列表、筛选、编辑和灯箱模块，列表按钮统一由 `admin-list.js` 处理；登录页脚本较短，留在模板内；深色模式由 `theme.js` 提供
- 页面只引用 `style.css`，其中的 `@import` 按基础、浏览、弹窗、后台、站点和响应式的顺序引入。添加新样式时放入对应文件；若规则依赖覆盖顺序，请保持该入口的导入顺序

### 界面行为

- 首页展示网站说明、使用指南和猫鼠wiki友链，不默认选中分类。桌面端分类导航固定在窗口左侧、可收为图标窄栏；手机端通过顶部「分类」按钮打开左侧抽屉，选择后自动关闭
- 页面内返回按钮按当前层级导航，浏览器返回键按历史记录返回；分类和主题页面先展示地图选择，再展示投稿预览，灯箱只浏览当前点位的图片
- 结果页点击标签时保留当前地图范围，可通过「清除标签筛选」取消，或通过「查看全站同标签」扩大查询范围
- 投稿弹窗关闭后在当前页面会话中保留文字、地图选择及图片，提交成功或点击「放弃草稿」后清空；刷新或离开页面不保留草稿

### 后台管理

- 入口：首页右上角「后台」，或直接访问 `/admin`
- 登录账号密码由 `config.py` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 控制（登录态存于 Flask session，**无 CSRF 防护**）
- **待审核 / 已审核** 两个标签页；单个操作包括通过（发送通过邮件）、拒绝（删记录+图片，并邮件告知未通过）、删除（删记录+图片，不发送邮件）、编辑（改分类/地图/标题/描述/投稿人/邮箱）；**全部通过**一次性通过所有待审核投稿（不逐条发邮件）
- API 鉴权：未登录访问 `/admin/pending` 等返回 401，页面路由 302 跳转登录页

## 测试

后端回归使用临时数据库、临时图片目录与独立配置，不依赖本地 `config.py`，不发送真实邮件：

```bash
.venv/bin/python -m unittest discover -s tests -p '*test.py'   # Windows: .venv\Scripts\python.exe
node --test tests/*.test.mjs                                   # 需 Node.js 22.7+，无需安装 npm 依赖
```

后端覆盖启动入口、数据库迁移、浏览投稿及后台审核，以及重启回归：连续 3 次独立进程加载后数据与图片保留、同一密钥签发的登录会话仍有效、重复初始化不改写现有记录、重启后继续审核写入、SQLite 完整性、页面引用的 JS/CSS 递归依赖可访问。

前端覆盖分享链接恢复、页面前进后退、弹层历史清理、API 错误处理（连接中断后再次请求、502 非 JSON 响应和 503 错误不会被误判为操作成功）、后台会话失效与旧点位数据兼容。`tests/interactions.test.mjs` 使用 DOM 替身验证事件和状态，不替代真实浏览器的布局及触屏验收。

自动测试使用 Flask 测试客户端及独立 Python 子进程，不验证 Linux 信号处理、Gunicorn 在途请求排空或 Nginx 配置，也不代表重启期间零中断。上线前使用项目虚拟环境执行上述命令，重启后再通过实际域名验证。

## 常见问题

**Q：启动报错 `ModuleNotFoundError: No module named 'config'`**
A：缺少 `config.py`。参照「配置文件」一节创建（或复制 `config.example.py`），然后重启。

**Q：数据库结构变了，但老数据还在？**
A：`init_db()` 执行代码中已定义的补列与历史数据迁移，不会自动处理任意结构变更。涉及列改名/删除时，应备份后编写并验证专项迁移；仅可对无需保留数据的本地测试库删除重建。

**Q：投稿图片为什么不是原图？**
A：所有上传图片统一转为 PNG：原图最长边限制 1600px，缩略图宽度 400px，均按自然宽高比缩放，不裁剪。

## 开发约定

- UI 文案、注释、接口错误信息统一使用中文
- 前端无构建步骤，改动 `static/` 后刷新页面；修改 `templates/` 时，当前非调试配置下需重启应用以清除模板缓存
- 上线前使用项目虚拟环境执行「测试」一节的全部命令，重启后再通过实际域名验证
- `database.db`、`config.py`、`AGENTS.md` 均被 gitignore，改动它们不会出现在 `git status` 中
