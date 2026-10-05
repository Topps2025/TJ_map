# -*- coding: utf-8 -*-
"""后台登录状态校验与未授权请求响应。"""

from functools import wraps

from flask import jsonify, redirect, request, session, url_for


def _admin_request_is_json():
    """判断当前请求是否为返回 JSON 的接口（而非页面路由）。
    页面路由仅 /admin（登录页）与 /admin/dashboard（后台页），其余 /admin/* 与
    全部 /api/* 均返回 JSON：鉴权失败时这些接口应回 JSON 401，而不是 302 重定向到
    登录页（否则前端 fetch 跟随重定向拿到 HTML、res.json() 抛错，表现为“操作失败”
    而非“未登录”，与 /admin/pending 已有的 401 处理不一致）。"""
    if request.path.startswith("/api/"):
        return True
    # /admin（无尾斜杠）是登录页；/admin/dashboard 是后台页面 —— 这两个走重定向
    return request.path.startswith("/admin/") and request.path != "/admin/dashboard"


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            if _admin_request_is_json():
                return jsonify({"ok": False, "error": "未登录"}), 401
            return redirect(url_for("admin_login"))
        return f(*args, **kwargs)
    return wrapper
