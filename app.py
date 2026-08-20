# -*- coding: utf-8 -*-
"""猫和老鼠手游 点位查询网站 后端"""

import io
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
    # 娱乐地图
    "娱乐地图": [
        "经典之家-疯狂奶酪赛",
        "雪夜古堡-疯狂奶酪赛",
        "金丝雀之家",
        "熊猫馆-烟花大作战",
        "阳光沙滩",
        "后院",
        "5V5大都会",
        "家之典经",
        "经典之家-谁是外星人",
    ],
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
# thumb = 主题缩略图；full = 整图（仅常规地图有，娱乐地图为空）
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

# 娱乐地图缩略图（沿用 tjwiki specialImageUrl 规则）
_FUN_THUMBS = {
    "经典之家-疯狂奶酪赛": "经典之家-疯狂奶酪赛.png",
    "雪夜古堡-疯狂奶酪赛": "雪夜古堡.png",
    "金丝雀之家": "金丝雀之家.png",
    "熊猫馆-烟花大作战": "熊猫馆.png",
    "阳光沙滩": "阳光沙滩.png",
    "后院": "经典之家.png",
    "5V5大都会": "大都会.png",
    "家之典经": "经典之家.png",
    "经典之家-谁是外星人": "经典之家.png",
}

# 天宫-云上 有独立主题图
_THEME_THUMBS["天宫-云上"] = "天宫-云上.png"


def get_map_images(map_name):
    """返回 {thumb, full} 静态图片路径（/static/images/maps/ 下）。"""
    # 缩略图：娱乐地图用专属图；常规地图变体（I/II/III）继承主题族缩略图
    thumb = _FUN_THUMBS.get(map_name)
    if thumb is None:
        thumb = _THEME_THUMBS.get(map_name)
    if thumb is None:
        for group, maps in L2_GROUPS.items():
            if map_name in maps:
                thumb = _THEME_THUMBS.get(group)
                break
    full = "" if map_name in _FUN_THUMBS else f"{map_name}-地图.png"
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
    title TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    original_url TEXT NOT NULL,
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
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# 图片处理（Pillow：原图/缩略图 均转 WebP）
# ---------------------------------------------------------------------------

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS


def process_image(file_storage):
    """转换上传图片为 WebP：原图存 originals，宽400质量80缩略图存 thumbs。
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
    original_path = os.path.join(config.ORIGINALS_DIR, name + ".webp")
    original_img.save(os.path.join(BASE_DIR, original_path), "WEBP", quality=90)

    # 缩略图 宽400 质量80
    thumb = img.copy()
    w, h = thumb.size
    if w > config.THUMB_WIDTH:
        thumb = thumb.resize((config.THUMB_WIDTH, int(h * config.THUMB_WIDTH / w)), Image.LANCZOS)
    thumb_path = os.path.join(config.THUMBS_DIR, name + ".webp")
    thumb.save(os.path.join(BASE_DIR, thumb_path), "WEBP", quality=config.THUMB_QUALITY)

    return "/static/" + thumb_path.split("/", 1)[1], "/static/" + original_path.split("/", 1)[1]


# ---------------------------------------------------------------------------
# 邮件通知
# ---------------------------------------------------------------------------

def send_notify_email(title, submitter_email):
    """向管理员发送投稿通知。失败静默，不影响主流程。"""
    if not config.SMTP_ENABLED or not config.SMTP_HOST:
        return
    try:
        body = (
            "您好，\n\n"
            "有一位玩家向【猫和老鼠手游点位查询】提交了新点位，请前往后台审核。\n\n"
            f"点位标题：{title}\n"
            f"投稿人邮箱：{submitter_email or '（未填写）'}\n\n"
            "审核地址：/admin\n"
        )
        msg = MIMEText(body, "plain", "utf-8")
        msg["From"] = config.SMTP_USERNAME
        msg["To"] = config.ADMIN_NOTIFY_EMAIL
        msg["Subject"] = Header(config.EMAIL_SUBJECT, "utf-8")

        if config.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
        server.sendmail(config.SMTP_USERNAME, [config.ADMIN_NOTIFY_EMAIL], msg.as_string())
        server.quit()
    except Exception as e:
        app.logger.warning("邮件发送失败: %s", e)


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
    return jsonify({"ok": True, "data": L1_CATEGORIES})


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
        sql += " AND map_name_l3 = ?"
        args.append(l3)
    sql += " ORDER BY id DESC"

    conn = get_db()
    rows = conn.execute(sql, args).fetchall()
    conn.close()

    data = [dict(r) for r in rows]
    for item in data:
        item.pop("submitter_email", None)
    return jsonify({"ok": True, "data": data})


@app.route("/api/submit", methods=["POST"])
def api_submit():
    category_l1 = request.form.get("category_l1", "").strip()
    map_group_l2 = request.form.get("map_group_l2", "").strip()
    map_name_l3 = request.form.get("map_name_l3", "").strip()
    title = request.form.get("title", "").strip()
    submitter_email = request.form.get("submitter_email", "").strip()
    file = request.files.get("image")

    if category_l1 not in L1_CATEGORIES:
        return jsonify({"ok": False, "error": "请选择有效的分类"}), 400
    if map_group_l2 not in L2_GROUPS:
        return jsonify({"ok": False, "error": "请选择有效的地图主题"}), 400
    if map_name_l3 not in L2_GROUPS[map_group_l2]:
        return jsonify({"ok": False, "error": "请选择有效的具体地图"}), 400
    if not title or len(title) > 60:
        return jsonify({"ok": False, "error": "请输入 1-60 字的点位描述"}), 400
    if submitter_email and not re.match(r"^[\w.\-+]+@[\w\-]+(\.[\w\-]+)+$", submitter_email):
        return jsonify({"ok": False, "error": "邮箱格式不正确"}), 400
    if file is None or file.filename == "":
        return jsonify({"ok": False, "error": "请上传点位图片(PNG)"}), 400

    try:
        thumb_url, original_url = process_image(file)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        app.logger.exception("图片处理失败")
        return jsonify({"ok": False, "error": "图片处理失败，请重试"}), 500

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO points (category_l1, map_group_l2, map_name_l3, title, "
        "thumb_url, original_url, status, submitter_email, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now', 'localtime'))",
        (category_l1, map_group_l2, map_name_l3, title, thumb_url, original_url, submitter_email),
    )
    conn.commit()
    pid = cur.lastrowid
    conn.close()

    send_notify_email(title, submitter_email)

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
    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


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
    return jsonify({"ok": True, "message": "已通过"})


@app.route("/admin/reject/<int:point_id>", methods=["POST"])
def admin_reject(point_id):
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    _remove_files([row["thumb_url"], row["original_url"]])
    conn = get_db()
    conn.execute("DELETE FROM points WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "message": "已拒绝并删除"})


@app.route("/admin/approve_all", methods=["POST"])
@admin_required
def admin_approve_all():
    conn = get_db()
    cur = conn.execute("UPDATE points SET status = 'approved' WHERE status = 'pending'")
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return jsonify({"ok": True, "updated": updated, "message": f"已通过 {updated} 条"})


@app.route("/admin/bulk_upload", methods=["POST"])
@admin_required
def admin_bulk_upload():
    category_l1 = request.form.get("category_l1", "").strip()
    map_group_l2 = request.form.get("map_group_l2", "").strip()
    map_name_l3 = request.form.get("map_name_l3", "").strip()
    titles = [t.strip() for t in request.form.getlist("titles")]
    files = request.files.getlist("files")

    if category_l1 not in L1_CATEGORIES:
        return jsonify({"ok": False, "error": "请选择有效的分类"}), 400
    if map_group_l2 not in L2_GROUPS:
        return jsonify({"ok": False, "error": "请选择有效的地图主题"}), 400
    if map_name_l3 not in L2_GROUPS[map_group_l2]:
        return jsonify({"ok": False, "error": "请选择有效的具体地图"}), 400
    if not files:
        return jsonify({"ok": False, "error": "请选择要上传的图片"}), 400
    if len(files) != len(titles):
        return jsonify({"ok": False, "error": "图片数量与标题数量不一致"}), 400
    if len(files) > 50:
        return jsonify({"ok": False, "error": "单次最多上传 50 张图片"}), 400
    for t in titles:
        if not t or len(t) > 60:
            return jsonify({"ok": False, "error": "每个标题需为 1-60 字"}), 400

    conn = get_db()
    inserted = 0
    results = []
    for idx, (file, title) in enumerate(zip(files, titles)):
        if file is None or file.filename == "":
            results.append({"index": idx, "ok": False, "error": "文件为空"})
            continue
        try:
            thumb_url, original_url = process_image(file)
        except ValueError as e:
            results.append({"index": idx, "ok": False, "error": str(e)})
            continue
        except Exception:
            app.logger.exception("批量上传图片处理失败")
            results.append({"index": idx, "ok": False, "error": "图片处理失败"})
            continue
        cur = conn.execute(
            "INSERT INTO points (category_l1, map_group_l2, map_name_l3, title, "
            "thumb_url, original_url, status, submitter_email, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'approved', '', datetime('now', 'localtime'))",
            (category_l1, map_group_l2, map_name_l3, title, thumb_url, original_url),
        )
        inserted += 1
        results.append({"index": idx, "ok": True, "id": cur.lastrowid})
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "inserted": inserted, "results": results})


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
