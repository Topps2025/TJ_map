# -*- coding: utf-8 -*-
"""配置示例：复制为 config.py 后按需修改。
注意：config.py 被 .gitignore 排除，不会入库；缺少 config.py 应用无法启动。
"""

import os

# Flask session 密钥（生产环境务必改为随机值）
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-to-a-random-string")

# 数据库
DATABASE_PATH = "database.db"

# 上传限制（字节）
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}
THUMB_WIDTH = 400
ORIGINALS_DIR = "static/originals"
THUMBS_DIR = "static/thumbs"

# 后台管理员账号
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change-me")

# 邮件通知（QQ SMTP；SMTP_PASSWORD 为授权码，非登录密码）
SMTP_ENABLED = True
SMTP_HOST = "smtp.qq.com"
SMTP_PORT = 465
SMTP_USE_SSL = True
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "your@qq.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "your-smtp-auth-code")
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "your@qq.com")
EMAIL_SUBJECT = "【猫和老鼠点位】新投稿通知"
