# -*- coding: utf-8 -*-
"""猫和老鼠手游 点位查询网站 后端"""

import io
import json
import os
import re
import sqlite3
import smtplib
import uuid
from email.mime.text import MIMEText
from email.header import Header
from functools import wraps

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    send_from_directory,
)
from flask_cors import CORS
from PIL import Image

import config

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_SIZE

# ---------------------------------------------------------------------------
# 三级联动 基础数据（第一层分类 -> 第二层地图主题 -> 第三层具体地图）
# 地图清单与命名以 tjwiki 仓库（Tom-and-jerry-chase-wiki/src/data/maps.ts）为准
# ---------------------------------------------------------------------------

L1_CATEGORIES = [
    "挂机果盘点位",
    "炸药桶点位",
    "投掷物点投点位",
    "罗宾汉泰菲种树点位",
]

# 分类配图（图片取自 tjwiki 仓库 public/images/mice/）
L1_CATEGORY_ICONS = {
    "挂机果盘点位": "/static/images/mice/恶魔泰菲.png",
    "炸药桶点位": "/static/images/mice/莱恩.png",
    "投掷物点投点位": "/static/images/mice/航海士杰瑞.png",
    "罗宾汉泰菲种树点位": "/static/images/mice/罗宾汉泰菲.png",
}

# 分类介绍页内容（点击分类后先展示介绍，再进入地图选择）
# 说明：介绍文字留白，由站点作者自行编写。
# 结构：{"description": 介绍段落, "tips": [要点列表]}，字段为空则页面不展示对应区域。
L1_CATEGORY_INFO = {
    "挂机果盘点位": {"description": "", "tips": []},
    "炸药桶点位": {"description": "", "tips": []},
    "投掷物点投点位": {"description": "", "tips": []},
    "罗宾汉泰菲种树点位": {"description": "", "tips": []},
}

# 分类改名迁移：旧分类 -> 新分类（几何桶/隔墙炸 合并为 炸药桶）
L1_CATEGORY_MIGRATE = {
    "几何桶点位": "炸药桶点位",
    "莱恩隔墙炸点位": "炸药桶点位",
}

# 常规地图（按主题族分组）
L2_GROUPS = {
    "经典之家": ["经典之家I", "经典之家II", "经典之家III"],
    "雪夜古堡": ["雪夜古堡I", "雪夜古堡II", "雪夜古堡III"],
    "夏日游轮": ["夏日游轮I", "夏日游轮II", "夏日游轮III"],
    "太空堡垒": ["太空堡垒I", "太空堡垒II", "太空堡垒III"],
    "游乐场": ["游乐场"],
    "森林牧场": ["森林牧场"],
    "大都会": ["大都会"],
    "熊猫馆": ["熊猫馆"],
    "御门酒店": ["御门酒店"],
    "天宫": ["天宫", "天宫-云上"],
}


def get_groups_for_l1(l1):
    """第二层：给定分类返回可用地图主题。当前各分类共用一套地图主题。"""
    if l1 not in L1_CATEGORIES:
        return []
    return list(L2_GROUPS.keys())


def get_maps_for_l1_l2(l1, l2):
    """第三层：给定分类+主题 返回具体地图。"""
    if l1 not in L1_CATEGORIES or l2 not in L2_GROUPS:
        return []
    return L2_GROUPS[l2]


# ---------------------------------------------------------------------------
# 地图静态图片（来自 tjwiki 仓库 public/images/maps/）
# thumb = 主题缩略图；full = 整图
# ---------------------------------------------------------------------------

# 主题族缩略图（I/II/III 变体共用主题图）
_THEME_THUMBS = {
    "经典之家": "经典之家.png",
    "雪夜古堡": "雪夜古堡.png",
    "夏日游轮": "夏日游轮.png",
    "太空堡垒": "太空堡垒.png",
    "游乐场": "游乐场.png",
    "森林牧场": "森林牧场.png",
    "大都会": "大都会.png",
    "熊猫馆": "熊猫馆.png",
    "御门酒店": "御门酒店.png",
    "天宫": "天宫.png",
}

# 天宫-云上 有独立主题图
_THEME_THUMBS["天宫-云上"] = "天宫-云上.png"


def get_map_images(map_name):
    """返回 {thumb, full} 静态图片路径（/static/images/maps/ 下）。"""
    # 缩略图：变体（I/II/III）继承主题族缩略图
    thumb = _THEME_THUMBS.get(map_name)
    if thumb is None:
        for group, maps in L2_GROUPS.items():
            if map_name in maps:
                thumb = _THEME_THUMBS.get(group)
                break
    full = f"{map_name}-地图.png"
    return {
        "thumb": f"/static/images/maps/{thumb}" if thumb else "",
        "full": f"/static/images/maps/{full}" if full else "",
    }


# ---------------------------------------------------------------------------
# 数据库
# ---------------------------------------------------------------------------

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_l1 TEXT NOT NULL,
    map_group_l2 TEXT NOT NULL,
    map_name_l3 TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'untitle',
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    submitter TEXT DEFAULT '',
    thumb_url TEXT NOT NULL,
    original_url TEXT NOT NULL,
    images TEXT DEFAULT '[]',
    maps TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    submitter_email TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_status ON points(status);
"""


def get_db():
    conn = sqlite3.connect(os.path.join(BASE_DIR, config.DATABASE_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript(DB_SCHEMA)
    # 旧分类名迁移（几何桶/隔墙炸 -> 炸药桶）
    for old, new in L1_CATEGORY_MIGRATE.items():
        conn.execute("UPDATE points SET category_l1 = ? WHERE category_l1 = ?", (new, old))
    # 新字段迁移：补列 + 旧投稿标题统一为 untitle（原标题转入描述）
    cols = [r[1] for r in conn.execute("PRAGMA table_info(points)")]
    new_cols = {
        "description": "ALTER TABLE points ADD COLUMN description TEXT DEFAULT ''",
        "tags": "ALTER TABLE points ADD COLUMN tags TEXT DEFAULT ''",
        "submitter": "ALTER TABLE points ADD COLUMN submitter TEXT DEFAULT ''",
        "images": "ALTER TABLE points ADD COLUMN images TEXT DEFAULT '[]'",
    }
    need_title_migrate = False
    for name, ddl in new_cols.items():
        if name not in cols:
            conn.execute(ddl)
            need_title_migrate = True
    if need_title_migrate:
        conn.execute(
            "UPDATE points SET description = title WHERE description = '' OR description IS NULL"
        )
        conn.execute("UPDATE points SET title = 'untitle' WHERE title IS NOT 'untitle'")
    # 多地图字段迁移：补充 maps 列并回填旧数据（map_name_l3 为主地图）
    if "maps" not in cols:
        conn.execute("ALTER TABLE points ADD COLUMN maps TEXT DEFAULT '[]'")
        conn.execute("UPDATE points SET maps = json_array(map_name_l3) WHERE maps IS NULL OR maps = '[]'")
    # 标签回填：功能上线前的旧投稿，tags 为空但描述含 #标签 时重新提取
    for row in conn.execute(
        "SELECT id, description FROM points WHERE (tags IS NULL OR tags = '') AND description LIKE '%#%'"
    ):
        tags = _extract_tags(row["description"])
        if tags:
            conn.execute("UPDATE points SET tags = ? WHERE id = ?", (tags, row["id"]))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# 图片处理（Pillow：原图/缩略图 均转 PNG）
# ---------------------------------------------------------------------------

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS


def process_image(file_storage):
    """转换上传图片为 PNG：原图存 originals，宽400缩略图存 thumbs。
    返回 (thumb_url, original_url)，失败抛 ValueError。"""
    if not allowed_file(file_storage.filename):
        raise ValueError("仅支持 PNG/JPG/JPEG/WEBP/GIF/BMP 格式图片")

    img = Image.open(file_storage.stream)
    img.load()

    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    name = uuid.uuid4().hex
    os.makedirs(os.path.join(BASE_DIR, config.ORIGINALS_DIR), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, config.THUMBS_DIR), exist_ok=True)

    # 原图（限制尺寸防止超大图拖慢浏览）
    original_img = img.copy()
    original_img.thumbnail((1600, 1600))
    original_path = os.path.join(config.ORIGINALS_DIR, name + ".png")
    original_img.save(os.path.join(BASE_DIR, original_path), "PNG")

    # 缩略图 宽400
    thumb = img.copy()
    w, h = thumb.size
    if w > config.THUMB_WIDTH:
        thumb = thumb.resize((config.THUMB_WIDTH, int(h * config.THUMB_WIDTH / w)), Image.LANCZOS)
    thumb_path = os.path.join(config.THUMBS_DIR, name + ".png")
    thumb.save(os.path.join(BASE_DIR, thumb_path), "PNG")

    return "/static/" + thumb_path.split("/", 1)[1], "/static/" + original_path.split("/", 1)[1]


# ---------------------------------------------------------------------------
# 邮件通知
# ---------------------------------------------------------------------------

def send_email(to_addr, subject, body):
    """通用邮件发送（QQ SMTP）。失败静默，不影响主流程。"""
    if not config.SMTP_ENABLED or not config.SMTP_HOST or not to_addr:
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["From"] = config.SMTP_USERNAME
        msg["To"] = to_addr
        msg["Subject"] = Header(subject, "utf-8")

        if config.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
        server.sendmail(config.SMTP_USERNAME, [to_addr], msg.as_string())
        server.quit()
    except Exception as e:
        app.logger.warning("邮件发送失败: %s", e)


def send_notify_email(title, submitter, submitter_email):
    """向管理员发送投稿通知（含问候语）。失败静默。"""
    body = (
        "您好，管理员：\n\n"
        "有一位玩家向【猫和老鼠手游点位查询】提交了新点位，请前往后台审核。\n\n"
        f"点位标题：{title or 'untitle'}\n"
        f"投稿人：{submitter or '（未填写）'}\n"
        f"投稿人邮箱：{submitter_email or '（未填写）'}\n\n"
        "审核地址：/admin\n"
    )
    send_email(config.ADMIN_NOTIFY_EMAIL, config.EMAIL_SUBJECT, body)


def _extract_tags(description):
    """从描述中提取 # 标签，如 '#果盘 #墙角' -> '果盘 墙角'（去重、保持顺序）。"""
    if not description:
        return ''
    tags = re.findall(r"#([^\s#]+)", description)
    seen = set()
    uniq = [t for t in tags if not (t in seen or seen.add(t))]
    return " ".join(uniq)


def send_submitter_email(submitter, to_addr, status, title, reason=""):
    """向投稿人发送邮件（问候语 + 状态通知）。失败静默。"""
    greet = f"您好，{submitter or '玩家'}："
    name = title or "untitle"
    if status == "submitted":
        subject = "【猫和老鼠点位】投稿已收到"
        body = (
            f"{greet}\n\n"
            f"感谢您向【猫和老鼠手游点位查询】投稿！\n"
            f"您的点位《{name}》已收到，审核通过后将在对应地图下展示。\n\n"
            "祝您游戏愉快！\n"
        )
    elif status == "approved":
        subject = "【猫和老鼠点位】投稿已通过审核"
        body = (
            f"{greet}\n\n"
            f"您投稿的点位《{name}》已通过审核并展示，感谢您的贡献！\n\n"
            "祝您游戏愉快！\n"
        )
    else:
        subject = "【猫和老鼠点位】投稿未通过审核"
        body = (
            f"{greet}\n\n"
            f"很遗憾，您投稿的点位《{name}》未通过审核，已删除。\n"
            + (f"拒绝原因：{reason}\n" if reason else "")
            + "\n如有疑问可重新投稿，祝您游戏愉快！\n"
        )
    send_email(to_addr, subject, body)


# ---------------------------------------------------------------------------
# 鉴权
# ---------------------------------------------------------------------------

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            if request.path.startswith("/api/") or request.path == "/admin/pending":
                return jsonify({"ok": False, "error": "未登录"}), 401
            return redirect(url_for("admin_login"))
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# 页面路由
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin_login():
    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))
    return render_template("admin_login.html")


@app.route("/admin/dashboard")
@admin_required
def admin_dashboard():
    return render_template("admin_dashboard.html")


# ---------------------------------------------------------------------------
# 前端 API
# ---------------------------------------------------------------------------

@app.route("/api/categories")
def api_categories():
    data = [
        {
            "name": c,
            "icon": L1_CATEGORY_ICONS.get(c, ""),
            **L1_CATEGORY_INFO.get(c, {}),
        }
        for c in L1_CATEGORIES
    ]
    return jsonify({"ok": True, "data": data})


@app.route("/api/groups")
def api_groups():
    l1 = request.args.get("l1", "")
    groups = get_groups_for_l1(l1)
    # 附带主题缩略图（取该主题第一张地图的 thumb）
    data = []
    for g in groups:
        first_map = L2_GROUPS[g][0]
        data.append({"name": g, "thumb": get_map_images(first_map)["thumb"]})
    return jsonify({"ok": True, "data": data})


@app.route("/api/maps")
def api_maps():
    l1 = request.args.get("l1", "")
    l2 = request.args.get("l2", "")
    maps = get_maps_for_l1_l2(l1, l2)
    data = [{"name": m, **get_map_images(m)} for m in maps]
    return jsonify({"ok": True, "data": data})


def _parse_maps(row):
    """解析 maps JSON（多地图列表），空则回退为主地图 map_name_l3。"""
    try:
        maps = json.loads(row.get("maps") or "[]")
    except (ValueError, TypeError):
        maps = []
    if not isinstance(maps, list) or not maps:
        maps = [row["map_name_l3"]] if row.get("map_name_l3") else []
    return maps


@app.route("/api/points")
def api_points():
    l1 = request.args.get("l1", "").strip()
    l2 = request.args.get("l2", "").strip()
    l3 = request.args.get("l3", "").strip()
    status = request.args.get("status", "approved").strip() or "approved"

    sql = "SELECT * FROM points WHERE status = ?"
    args = [status]
    if l1:
        sql += " AND category_l1 = ?"
        args.append(l1)
    if l2:
        sql += " AND map_group_l2 = ?"
        args.append(l2)
    if l3:
        # 多地图支持：匹配主地图 map_name_l3 或 maps 列表中的任一地图
        sql += " AND (map_name_l3 = ? OR instr(maps, json_quote(?)) > 0)"
        args += [l3, l3]
    sql += " ORDER BY id DESC"

    conn = get_db()
    rows = conn.execute(sql, args).fetchall()
    conn.close()

    data = [dict(r) for r in rows]
    for item in data:
        item.pop("submitter_email", None)
        try:
            item["images"] = json.loads(item.get("images") or "[]")
        except (ValueError, TypeError):
            item["images"] = []
        item["maps"] = _parse_maps(item)
    return jsonify({"ok": True, "data": data})


@app.route("/api/submit", methods=["POST"])
def api_submit():
    category_l1 = request.form.get("category_l1", "").strip()
    map_group_l2 = request.form.get("map_group_l2", "").strip()
    # 具体地图多选（兼容旧的单值 map_name_l3）
    map_names = [m.strip() for m in request.form.getlist("map_names_l3") if m.strip()]
    if not map_names:
        single = request.form.get("map_name_l3", "").strip()
        if single:
            map_names = [single]
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    submitter = request.form.get("submitter", "").strip()
    submitter_email = request.form.get("submitter_email", "").strip()
    files = [f for f in request.files.getlist("images") if f and f.filename]

    if category_l1 not in L1_CATEGORIES:
        return jsonify({"ok": False, "error": "请选择有效的分类"}), 400
    if map_group_l2 not in L2_GROUPS:
        return jsonify({"ok": False, "error": "请选择有效的地图主题"}), 400
    if not map_names:
        return jsonify({"ok": False, "error": "请至少选择一个具体地图"}), 400
    for m in map_names:
        if m not in L2_GROUPS[map_group_l2]:
            return jsonify({"ok": False, "error": f"地图「{m}」不属于该主题"}), 400
    if not title:
        return jsonify({"ok": False, "error": "请填写标题"}), 400
    if len(title) > 60:
        return jsonify({"ok": False, "error": "标题最长 60 字"}), 400
    if len(description) > 300:
        return jsonify({"ok": False, "error": "点位描述最长 300 字"}), 400
    if not submitter:
        return jsonify({"ok": False, "error": "请填写投稿人"}), 400
    if len(submitter) > 30:
        return jsonify({"ok": False, "error": "投稿人昵称最长 30 字"}), 400
    if not submitter_email:
        return jsonify({"ok": False, "error": "请填写投稿人邮箱"}), 400
    if not re.match(r"^[\w.\-+]+@[\w\-]+(\.[\w\-]+)+$", submitter_email):
        return jsonify({"ok": False, "error": "邮箱格式不正确"}), 400
    if not files:
        return jsonify({"ok": False, "error": "请上传至少一张点位图片(PNG)"}), 400
    if len(files) > 9:
        return jsonify({"ok": False, "error": "单次最多上传 9 张图片"}), 400

    images = []
    for f in files:
        try:
            thumb_url, original_url = process_image(f)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
        except Exception:
            app.logger.exception("图片处理失败")
            return jsonify({"ok": False, "error": "图片处理失败，请重试"}), 500
        images.append({"thumb": thumb_url, "original": original_url})

    thumb_url = images[0]["thumb"]
    original_url = images[0]["original"]
    images_json = json.dumps(images, ensure_ascii=False)

    # 描述中的 #标签 -> tags 列（如 #果盘 #墙角）
    tags = _extract_tags(description)

    # 去重并保持选择顺序；map_name_l3 记主地图（第一个）
    seen = set()
    maps_deduped = [m for m in map_names if not (m in seen or seen.add(m))]
    map_name_l3 = maps_deduped[0]
    maps_json = json.dumps(maps_deduped, ensure_ascii=False)

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO points (category_l1, map_group_l2, map_name_l3, maps, title, description, "
        "tags, submitter, thumb_url, original_url, images, status, submitter_email, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now', 'localtime'))",
        (category_l1, map_group_l2, map_name_l3, maps_json, title, description, tags, submitter,
         thumb_url, original_url, images_json, submitter_email),
    )
    conn.commit()
    pid = cur.lastrowid
    conn.close()

    send_notify_email(title, submitter, submitter_email)
    send_submitter_email(submitter, submitter_email, "submitted", title)

    return jsonify({"ok": True, "message": "投稿成功，审核通过后将展示", "id": pid}), 200


# ---------------------------------------------------------------------------
# 后台 API
# ---------------------------------------------------------------------------

@app.route("/admin/login", methods=["POST"])
def admin_do_login():
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    if username == config.ADMIN_USERNAME and password == config.ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"ok": True, "message": "登录成功"})
    return jsonify({"ok": False, "error": "账号或密码错误"}), 401


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("is_admin", None)
    return jsonify({"ok": True})


@app.route("/admin/pending")
@admin_required
def admin_pending():
    status = request.args.get("status", "pending")
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM points WHERE status = ? ORDER BY id DESC", (status,)
    ).fetchall()
    conn.close()
    data = [dict(r) for r in rows]
    for item in data:
        try:
            item["images"] = json.loads(item.get("images") or "[]")
        except (ValueError, TypeError):
            item["images"] = []
        item["maps"] = _parse_maps(item)
    return jsonify({"ok": True, "data": data})


def _find_point(point_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM points WHERE id = ?", (point_id,)).fetchone()
    conn.close()
    return row


def _remove_files(urls):
    """物理删除服务器图片文件（容忍不存在）。"""
    for url in urls:
        if not url:
            continue
        rel = url.replace("/static/", "static/", 1)
        path = os.path.join(BASE_DIR, rel)
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass


def _remove_point_files(row):
    """删除某条投稿关联的全部图片文件。"""
    urls = [row["thumb_url"], row["original_url"]]
    try:
        for item in json.loads(row["images"] or "[]"):
            urls.append(item.get("thumb"))
            urls.append(item.get("original"))
    except (ValueError, TypeError):
        pass
    _remove_files(urls)


@app.route("/admin/approve/<int:point_id>", methods=["POST"])
@admin_required
def admin_approve(point_id):
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    conn = get_db()
    conn.execute("UPDATE points SET status = 'approved' WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    send_submitter_email(row["submitter"], row["submitter_email"], "approved", row["title"])
    return jsonify({"ok": True, "message": "已通过"})


@app.route("/admin/reject/<int:point_id>", methods=["POST"])
@admin_required
def admin_reject(point_id):
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    reason = request.form.get("reason", "").strip()
    _remove_point_files(row)
    conn = get_db()
    conn.execute("DELETE FROM points WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    send_submitter_email(row["submitter"], row["submitter_email"], "rejected", row["title"], reason)
    return jsonify({"ok": True, "message": "已拒绝并删除"})


@app.route("/admin/delete/<int:point_id>", methods=["POST"])
@admin_required
def admin_delete(point_id):
    """硬删除：移除记录及关联图片文件，不发送邮件（区别于“拒绝”流程）。"""
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    _remove_point_files(row)
    conn = get_db()
    conn.execute("DELETE FROM points WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "message": "已删除"})


@app.route("/admin/edit/<int:point_id>", methods=["POST"])
@admin_required
def admin_edit(point_id):
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404

    category_l1 = request.form.get("category_l1", "").strip()
    map_group_l2 = request.form.get("map_group_l2", "").strip()
    # 具体地图多选（兼容旧的单值 map_name_l3）
    map_names = [m.strip() for m in request.form.getlist("map_names_l3") if m.strip()]
    if not map_names:
        single = request.form.get("map_name_l3", "").strip()
        if single:
            map_names = [single]
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    submitter = request.form.get("submitter", "").strip()
    submitter_email = request.form.get("submitter_email", "").strip()

    if category_l1 not in L1_CATEGORIES:
        return jsonify({"ok": False, "error": "请选择有效的分类"}), 400
    if map_group_l2 not in L2_GROUPS:
        return jsonify({"ok": False, "error": "请选择有效的地图主题"}), 400
    if not map_names:
        return jsonify({"ok": False, "error": "请至少选择一个具体地图"}), 400
    for m in map_names:
        if m not in L2_GROUPS[map_group_l2]:
            return jsonify({"ok": False, "error": f"地图「{m}」不属于该主题"}), 400
    if not title:
        return jsonify({"ok": False, "error": "请填写标题"}), 400
    if len(title) > 60:
        return jsonify({"ok": False, "error": "标题最长 60 字"}), 400
    if len(description) > 300:
        return jsonify({"ok": False, "error": "点位描述最长 300 字"}), 400
    if not submitter:
        return jsonify({"ok": False, "error": "请填写投稿人"}), 400
    if len(submitter) > 30:
        return jsonify({"ok": False, "error": "投稿人昵称最长 30 字"}), 400
    if not submitter_email:
        return jsonify({"ok": False, "error": "请填写投稿人邮箱"}), 400
    if not re.match(r"^[\w.\-+]+@[\w\-]+(\.[\w\-]+)+$", submitter_email):
        return jsonify({"ok": False, "error": "邮箱格式不正确"}), 400

    # 去重并保持选择顺序；map_name_l3 记主地图（第一个）
    seen = set()
    maps_deduped = [m for m in map_names if not (m in seen or seen.add(m))]
    map_name_l3 = maps_deduped[0]
    maps_json = json.dumps(maps_deduped, ensure_ascii=False)
    tags = _extract_tags(description)

    conn = get_db()
    conn.execute(
        "UPDATE points SET category_l1 = ?, map_group_l2 = ?, map_name_l3 = ?, maps = ?, "
        "title = ?, description = ?, tags = ?, submitter = ?, submitter_email = ? WHERE id = ?",
        (category_l1, map_group_l2, map_name_l3, maps_json, title, description, tags, submitter,
         submitter_email, point_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "message": "已保存"})


@app.route("/admin/approve_all", methods=["POST"])
@admin_required
def admin_approve_all():
    conn = get_db()
    cur = conn.execute("UPDATE points SET status = 'approved' WHERE status = 'pending'")
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return jsonify({"ok": True, "updated": updated, "message": f"已通过 {updated} 条"})


# ---------------------------------------------------------------------------
# 静态图片（统一走 Flask，避免裸目录访问）
# ---------------------------------------------------------------------------

@app.route("/static/originals/<path:filename>")
def serve_original(filename):
    return send_from_directory(os.path.join(BASE_DIR, "static", "originals"), filename)


@app.route("/static/thumbs/<path:filename>")
def serve_thumb(filename):
    return send_from_directory(os.path.join(BASE_DIR, "static", "thumbs"), filename)


@app.errorhandler(413)
def too_large(e):
    return jsonify({"ok": False, "error": "图片过大，请上传 10MB 以内的图片"}), 413


if __name__ == "__main__":
    os.makedirs(os.path.join(BASE_DIR, config.ORIGINALS_DIR), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, config.THUMBS_DIR), exist_ok=True)
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
