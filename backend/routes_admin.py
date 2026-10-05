# -*- coding: utf-8 -*-
"""后台登录、审核、编辑及删除接口。"""

from flask import jsonify, request, session

import config

from .auth import admin_required
from .database import get_db, _find_point
from .images import _remove_point_files
from .mail import send_submitter_email
from .points import _serialize_point, _validate_submission


def admin_do_login():
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    if username == config.ADMIN_USERNAME and password == config.ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"ok": True, "message": "登录成功"})
    return jsonify({"ok": False, "error": "账号或密码错误"}), 401


def admin_logout():
    session.pop("is_admin", None)
    return jsonify({"ok": True})


@admin_required
def admin_pending():
    """后台列表：按 status（pending/approved）过滤，支持可选 category_l1、map_group_l2 进一步筛选。"""
    status = request.args.get("status", "pending")
    category_l1 = request.args.get("category_l1", "").strip()
    map_group_l2 = request.args.get("map_group_l2", "").strip()

    sql = "SELECT * FROM points WHERE status = ?"
    args = [status]
    if category_l1:
        sql += " AND category_l1 = ?"
        args.append(category_l1)
    if map_group_l2:
        sql += " AND map_group_l2 = ?"
        args.append(map_group_l2)
    sql += " ORDER BY id DESC"

    conn = get_db()
    rows = conn.execute(sql, args).fetchall()
    conn.close()
    data = [_serialize_point(r, include_email=True) for r in rows]
    return jsonify({"ok": True, "data": data})


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


@admin_required
def admin_reject(point_id):
    """软删除：仅把状态置为 rejected，记录与图片文件保留（在后台“已拒绝”列表可恢复
    或彻底删除，彻底删除时才清理图片），避免误触一步删掉投稿。"""
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    reason = request.form.get("reason", "").strip()
    conn = get_db()
    conn.execute("UPDATE points SET status = 'rejected' WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    send_submitter_email(row["submitter"], row["submitter_email"], "rejected", row["title"], reason)
    return jsonify({"ok": True, "message": "已拒绝"})


@admin_required
def admin_restore(point_id):
    """把已拒绝的投稿恢复为待审核，重新进入审核队列。"""
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    conn = get_db()
    conn.execute("UPDATE points SET status = 'pending' WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "message": "已恢复为待审核"})


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


@admin_required
def admin_edit(point_id):
    row = _find_point(point_id)
    if not row:
        return jsonify({"ok": False, "error": "记录不存在"}), 404

    payload, err = _validate_submission(request.form)
    if err:
        return jsonify({"ok": False, "error": err}), 400

    conn = get_db()
    conn.execute(
        "UPDATE points SET category_l1 = ?, map_group_l2 = ?, map_name_l3 = ?, maps = ?, "
        "title = ?, description = ?, tags = ?, submitter = ?, submitter_email = ? WHERE id = ?",
        (payload["category_l1"], payload["map_group_l2"], payload["map_name_l3"],
         payload["maps"], payload["title"], payload["description"], payload["tags"],
         payload["submitter"], payload["submitter_email"], point_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "message": "已保存"})


@admin_required
def admin_approve_all():
    """批量通过待审核条目。与后台列表共用筛选参数（可选 category_l1 / map_group_l2），
    只通过当前筛选范围内的待审核投稿，避免把筛选外的隐藏投稿一并放行。
    与单条通过行为一致，逐条补发“已通过”通知邮件。"""
    cond_sql = ""
    args = []
    category_l1 = request.args.get("category_l1", "").strip()
    map_group_l2 = request.args.get("map_group_l2", "").strip()
    if category_l1:
        cond_sql += " AND category_l1 = ?"
        args.append(category_l1)
    if map_group_l2:
        cond_sql += " AND map_group_l2 = ?"
        args.append(map_group_l2)

    conn = get_db()
    # 先取出将要通过的记录用于补发邮件，再更新状态
    rows = conn.execute(
        "SELECT submitter, submitter_email, title FROM points WHERE status = 'pending'" + cond_sql,
        args,
    ).fetchall()
    cur = conn.execute(
        "UPDATE points SET status = 'approved' WHERE status = 'pending'" + cond_sql, args)
    conn.commit()
    updated = cur.rowcount
    conn.close()
    for row in rows:
        send_submitter_email(row["submitter"], row["submitter_email"], "approved", row["title"])
    return jsonify({"ok": True, "updated": updated, "message": f"已通过 {updated} 条"})


def register_routes(app):
    """注册路由，保留原有 URL 与端点名称。"""
    app.add_url_rule('/admin/login', view_func=admin_do_login, methods=['POST'])
    app.add_url_rule('/admin/logout', view_func=admin_logout, methods=['POST'])
    app.add_url_rule('/admin/pending', view_func=admin_pending)
    app.add_url_rule('/admin/approve/<int:point_id>', view_func=admin_approve, methods=['POST'])
    app.add_url_rule('/admin/reject/<int:point_id>', view_func=admin_reject, methods=['POST'])
    app.add_url_rule('/admin/restore/<int:point_id>', view_func=admin_restore, methods=['POST'])
    app.add_url_rule('/admin/delete/<int:point_id>', view_func=admin_delete, methods=['POST'])
    app.add_url_rule('/admin/edit/<int:point_id>', view_func=admin_edit, methods=['POST'])
    app.add_url_rule('/admin/approve_all', view_func=admin_approve_all, methods=['POST'])
