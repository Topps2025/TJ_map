# 猫和老鼠手游点位查询（TJ_map）

一个基于 **Flask + SQLite** 的《猫和老鼠》手游点位查询网站。玩家可以按 **分类 → 地图主题 → 具体地图** 三级联动浏览点位（挂机果盘、炸药桶、投掷物点投、罗宾汉泰菲种树等），并在线投稿带截图的新点位，管理员审核通过后展示。

## 功能特性

- **三级联动浏览**：分类（L1）→ 地图主题（L2）→ 具体地图（L3），点位以网格卡片展示
- **点位投稿**：支持一次上传最多 9 张图片（PNG/JPG/JPEG/WEBP/GIF/BMP），自动转 PNG 并生成缩略图；投稿需填写标题、投稿人、邮箱
- **后台管理**：登录审核，支持单个通过/拒绝/删除/编辑，以及一键全部通过；拒绝/删除会同时清理图片文件
- **邮件通知**：投稿后自动通知管理员，并向投稿人发送「已收到 / 已通过 / 未通过」邮件（QQ SMTP，失败静默不影响主流程）
- **深色模式**：跟随系统偏好，可手动切换并持久化到 localStorage
- **简约前端**：原生 HTML/JS/CSS，无构建步骤，无需 Node 环境

## 技术栈

| 组件 | 技术 |
| --- | --- |
| 后端 | Flask 2.x / 3.x（单文件 `app.py`） |
| 数据库 | SQLite（`database.db`，启动时自动建库，无 ORM） |
| 图片处理 | Pillow（原图 ≤1600px、缩略图宽 400px，统一转 PNG） |
| 前端 | 原生 JS + CSS（无框架、无构建工具） |
| CORS | flask-cors |

## 目录结构

```
TJ_map/
├── app.py                  # 全部后端逻辑：路由、API、图片处理、邮件、鉴权
├── config.py               # 配置（gitignore，必须自行创建，见下文「配置文件」）
├── requirements.txt        # Python 依赖
├── database.db             # SQLite 数据库（首次启动自动创建，gitignore）
├── static/
│   ├── css/style.css       # 全局样式（含深色模式）
│   ├── js/main.js          # 前端逻辑（三级联动、投稿、后台）
│   ├── js/theme.js         # 深色模式
│   ├── images/maps/*.png   # 地图静态图（已入库）
│   ├── images/mice/*.png   # 分类老鼠图标（已入库）
│   ├── originals/          # 投稿原图（gitignore，保留 .gitkeep）
│   └── thumbs/             # 投稿缩略图（gitignore，保留 .gitkeep）
└── templates/              # 纯 HTML 模板（无 Jinja）
    ├── index.html          # 前台首页
    ├── admin_login.html    # 后台登录
    └── admin_dashboard.html# 后台管理
```

## 快速开始（本地运行）

要求：Python 3.8+（开发环境已验证 3.14）。

```bash
# 1. 克隆仓库
git clone git@github.com:Topps2025/TJ_map.git
cd TJ_map

# 2. 创建虚拟环境并安装依赖
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. 创建配置文件（见下文「配置文件」一节）
cp config.example.py config.py   # 或手动创建

# 4. 启动（首次启动自动建库、创建图片目录）
python app.py
```

访问 `http://127.0.0.1:5000`。

## 配置文件

> `config.py` 被 `.gitignore` 排除、**不随仓库分发**，但 `app.py` 在导入时强依赖它——**缺少 `config.py` 应用无法启动**。请参照下表创建，或复制仓库根目录的 `config.example.py`（如提供）。

| 配置项 | 说明 | 示例值 |
| --- | --- | --- |
| `SECRET_KEY` | Flask session 密钥，生产环境务必换用随机值 | `"change-me"` |
| `DATABASE_PATH` | 数据库文件相对路径 | `"database.db"` |
| `MAX_UPLOAD_SIZE` | 单次上传体积上限（字节），配合 413 错误提示约 10MB | `10 * 1024 * 1024` |
| `ALLOWED_EXTENSIONS` | 允许的图片格式集合 | `{"png","jpg","jpeg","webp","gif","bmp"}` |
| `THUMB_WIDTH` | 缩略图宽度（px） | `400` |
| `ORIGINALS_DIR` | 原图目录 | `"static/originals"` |
| `THUMBS_DIR` | 缩略图目录 | `"static/thumbs"` |
| `ADMIN_USERNAME` | 后台管理员账号 | `"admin"` |
| `ADMIN_PASSWORD` | 后台管理员密码（生产环境务必修改） | `"change-me"` |
| `SMTP_ENABLED` | 是否开启邮件通知 | `True` |
| `SMTP_HOST` / `SMTP_PORT` | SMTP 服务器地址/端口（QQ SMTP 为 `smtp.qq.com:465`） | `"smtp.qq.com"` / `465` |
| `SMTP_USE_SSL` | 是否使用 SSL | `True` |
| `SMTP_USERNAME` | SMTP 账号（QQ 邮箱地址） | `"xx@qq.com"` |
| `SMTP_PASSWORD` | SMTP 授权码（QQ 邮箱需生成授权码，非登录密码） | `"授权码"` |
| `ADMIN_NOTIFY_EMAIL` | 接收新投稿通知的管理员邮箱 | `"xx@qq.com"` |
| `EMAIL_SUBJECT` | 通知邮件主题 | `"【猫和老鼠点位】新投稿通知"` |

> 注意：`SMTP_ENABLED` 默认开启，但邮件发送失败会**静默吞掉异常**，不影响页面流程——不要依赖邮件作为唯一通知手段。

## 部署

### 方式一：开发 / 内网运行

```bash
python app.py
```

监听 `0.0.0.0:5000`。

### 方式二：生产部署（Gunicorn + systemd + Nginx）

应用是标准 WSGI 应用（`app:app`），可按常规 Flask 方式部署。

**① 安装依赖**

```bash
python -m venv /opt/tj_map/.venv
source /opt/tj_map/.venv/bin/activate
pip install -r requirements.txt gunicorn
```

**② 初始化数据库与目录**

> ⚠️ `init_db()` 只在 `python app.py`（`__main__`）时自动执行；用 Gunicorn 导入时**不会**自动建库，需要手动执行一次：

```bash
cd /opt/tj_map && .venv/bin/python -c "import app; app.init_db()"
```

**③ 创建 systemd 服务** `/etc/systemd/system/tj_map.service`：

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

**④ Nginx 反向代理** `/etc/nginx/sites-available/tj_map`：

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

**部署注意事项**

- 上传图片经 `/static/originals/`、`/static/thumbs/` 两个显式 Flask 路由提供（不依赖 Nginx alias），确保应用进程可读写这两个目录
- 数据库是单文件 SQLite，生产环境建议定期备份 `database.db`（停服时复制，或用 `sqlite3 database.db ".backup bak.db"`）
- 务必修改 `SECRET_KEY` 与 `ADMIN_PASSWORD`

## 数据来源与维护

- **地图清单与命名**以 `Tom-and-jerry-chase-wiki` 仓库（`src/data/maps.ts`）为权威来源，**不要凭空发明地图名**；地图静态图来自其 `public/images/maps/`
- 分类/主题/地图等基础数据全部维护在 `app.py` 顶部的三个结构里，改数据改字典、不动模板：
  - `L1_CATEGORIES`：一级分类；`L1_CATEGORY_ICONS`：分类图标；`L1_CATEGORY_INFO`：分类介绍页文案
  - `L2_GROUPS`：二级地图主题 → 三级具体地图的映射
  - `L1_CATEGORY_MIGRATE`：历史分类改名迁移（启动时自动改写存量数据）
- `static/images/mice/*.png`（分类老鼠图标）已随仓库入库，克隆即用
- 其他 schema 变更无迁移工具：`init_db()` 只能自动**新增列**（`PRAGMA table_info` + `ALTER TABLE`），改动或删除列需要手动删除 `database.db` 重建

## 后台管理

- 入口：首页右上角「后台」，或直接访问 `/admin`
- 登录账号密码由 `config.py` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 控制（登录态存于 Flask session，无 CSRF 防护）
- 功能：
  - **待审核 / 已审核** 两个标签页查看投稿
  - 单个操作：通过（发送通过邮件）、拒绝（删记录+图片，并邮件告知未通过）、删除（删记录+图片，不发送邮件）、编辑（改分类/地图/标题/描述/投稿人/邮箱）
  - **全部通过**：一次性通过所有待审核投稿（不逐条发邮件）
- API 鉴权：未登录访问 `/admin/pending` 等返回 401，页面路由 302 跳转登录页

## 常见问题

**Q：启动报错 `ModuleNotFoundError: No module named 'config'`**
A：缺少 `config.py`。参照「配置文件」一节手动创建（或复制 `config.example.py`），然后重启。

**Q：数据库结构变了，但老数据还在？**
A：`init_db()` 只做新增列迁移。涉及列改名/删除时，删除 `database.db` 重新初始化（数据会丢失，注意先备份）。

**Q：投稿图片为什么不是原图？**
A：所有上传图片统一转为 PNG：原图最长边限制 1600px，缩略图宽度 400px，均按自然宽高比缩放，不裁剪。

## 开发约定

- UI 文案、注释、接口错误信息统一使用中文
- 前端无构建步骤，改动 `templates/`、`static/` 后刷新页面即可（后端模板路由需重启）
- 无测试、无 linter、无 CI，验证方式为运行后 `curl` 接口、页面操作
- `database.db`、`config.py`、`AGENTS.md` 均被 gitignore，改动它们不会出现在 `git status` 中
