# -*- coding: utf-8 -*-
"""页面路由及上传超限处理。"""

from flask import jsonify, redirect, render_template, session, url_for

from .auth import admin_required


def index():
    return render_template("index.html")


def admin_login():
    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))
    return render_template("admin_login.html")


@admin_required
def admin_dashboard():
    return render_template("admin_dashboard.html")


def too_large(e):
    return jsonify({"ok": False, "error": "图片过大，请上传 10MB 以内的图片"}), 413


def register_routes(app):
    """注册路由，保留原有 URL 与端点名称。"""
    app.add_url_rule('/', view_func=index)
    app.add_url_rule('/admin', view_func=admin_login)
    app.add_url_rule('/admin/dashboard', view_func=admin_dashboard)
    app.register_error_handler(413, too_large)
