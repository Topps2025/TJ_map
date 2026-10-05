# -*- coding: utf-8 -*-
"""分类浏览、点位查询与投稿接口。"""

import json

from flask import current_app, jsonify, request

from .catalog import (
    L1_CATEGORIES, L1_CATEGORY_ICONS, L1_CATEGORY_INFO, L2_GROUPS,
    get_groups_for_l1, get_maps_for_l1_l2, get_map_images,
)
from .database import get_db
from .images import process_image
from .mail import send_notify_email, send_submitter_email
from .points import _serialize_point, _validate_submission


# 单邮箱同时挂起的待审核投稿上限（防刷稿；配合后台“已拒绝”软删除可清理空间）
PENDING_LIMIT_PER_EMAIL = 5


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


def api_groups():
    l1 = request.args.get("l1", "")
    groups = get_groups_for_l1(l1)
    # 附带主题缩略图（取该主题第一张地图的 thumb）
    data = []
    for g in groups:
        first_map = L2_GROUPS[g][0]
        data.append({"name": g, "thumb": get_map_images(first_map)["thumb"]})
    return jsonify({"ok": True, "data": data})


def api_maps():
    l1 = request.args.get("l1", "")
    l2 = request.args.get("l2", "")
    maps = get_maps_for_l1_l2(l1, l2)
    data = [{"name": m, **get_map_images(m)} for m in maps]
    return jsonify({"ok": True, "data": data})


def api_points():
    l1 = request.args.get("l1", "").strip()
    l2 = request.args.get("l2", "").strip()
    l3 = request.args.get("l3", "").strip()
    tag = request.args.get("tag", "").strip()
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
        # 多地图支持：匹配主地图 map_name_l3 或 maps 数组中的任一地图
        # （用 json_each 精确匹配元素，避免 instr(json_quote) 子串误命中的隐患）
        sql += (
            " AND (map_name_l3 = ? OR EXISTS "
            "(SELECT 1 FROM json_each(maps) WHERE value = ?))"
        )
        args += [l3, l3]
    sql += " ORDER BY id DESC"

    conn = get_db()
    rows = conn.execute(sql, args).fetchall()
    conn.close()

    if tag:
        # 标签按空格分词后精确匹配（LIKE 子串会误命中，如“果”匹配“果盘”）
        rows = [r for r in rows if tag in (r["tags"] or "").split()]

    data = [_serialize_point(r, include_email=False) for r in rows]
    return jsonify({"ok": True, "data": data})


def api_submit():
    payload, err = _validate_submission(request.form)
    if err:
        return jsonify({"ok": False, "error": err}), 400

    # 刷稿防护（在处理图片之前快速失败）：
    # 1) 同邮箱+同分类+同标题视为重复投稿（已拒绝的不算，允许被拒后修改重投）
    # 2) 同邮箱待审核条数达到上限时暂时禁止再投
    conn = get_db()
    dup = conn.execute(
        "SELECT 1 FROM points WHERE submitter_email = ? AND category_l1 = ? AND title = ? "
        "AND status != 'rejected' LIMIT 1",
        (payload["submitter_email"], payload["category_l1"], payload["title"]),
    ).fetchone()
    pending_n = conn.execute(
        "SELECT COUNT(*) AS c FROM points WHERE submitter_email = ? AND status = 'pending'",
        (payload["submitter_email"],),
    ).fetchone()["c"]
    conn.close()
    if dup:
        return jsonify({"ok": False, "error": "您已提交过同标题的点位，请勿重复投稿"}), 400
    if pending_n >= PENDING_LIMIT_PER_EMAIL:
        return jsonify({"ok": False, "error": "您待审核的投稿较多，请等待审核结果后再投稿"}), 400

    files = [f for f in request.files.getlist("images") if f and f.filename]
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
            current_app.logger.exception("图片处理失败")
            return jsonify({"ok": False, "error": "图片处理失败，请重试"}), 500
        images.append({"thumb": thumb_url, "original": original_url})

    images_json = json.dumps(images, ensure_ascii=False)

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO points (category_l1, map_group_l2, map_name_l3, maps, title, description, "
        "tags, submitter, thumb_url, original_url, images, status, submitter_email, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now', 'localtime'))",
        (payload["category_l1"], payload["map_group_l2"], payload["map_name_l3"],
         payload["maps"], payload["title"], payload["description"], payload["tags"],
         payload["submitter"], images[0]["thumb"], images[0]["original"], images_json,
         payload["submitter_email"]),
    )
    conn.commit()
    pid = cur.lastrowid
    conn.close()

    send_notify_email(payload["title"], payload["submitter"], payload["submitter_email"])
    send_submitter_email(payload["submitter"], payload["submitter_email"], "submitted", payload["title"])

    return jsonify({"ok": True, "message": "投稿成功，审核通过后将展示", "id": pid}), 200


def register_routes(app):
    """注册路由，保留原有 URL 与端点名称。"""
    app.add_url_rule('/api/categories', view_func=api_categories)
    app.add_url_rule('/api/groups', view_func=api_groups)
    app.add_url_rule('/api/maps', view_func=api_maps)
    app.add_url_rule('/api/points', view_func=api_points)
    app.add_url_rule('/api/submit', view_func=api_submit, methods=['POST'])
