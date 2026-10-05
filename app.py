# -*- coding: utf-8 -*-
"""应用入口：兼容 python app.py、Gunicorn app:app 和 app.init_db()。"""

import os

from flask import Flask
from flask_cors import CORS

import config
from backend.database import init_db
from backend.paths import BASE_DIR
from backend import routes_admin, routes_pages, routes_public

# 在根目录创建应用，保持模板、静态资源路径和会话配置不变。
app = Flask(__name__)
app.secret_key = config.SECRET_KEY
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_SIZE

routes_pages.register_routes(app)
routes_public.register_routes(app)
routes_admin.register_routes(app)


if __name__ == "__main__":
    os.makedirs(os.path.join(BASE_DIR, config.ORIGINALS_DIR), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, config.THUMBS_DIR), exist_ok=True)
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
