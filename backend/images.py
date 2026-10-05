# -*- coding: utf-8 -*-
"""投稿图片转换、缩略图生成与文件清理。"""

import json
import os
import uuid

from PIL import Image

import config

from .paths import BASE_DIR


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

    # 直接以正斜杠拼 URL，避免在 Windows 上 os.path.join 产生反斜杠导致 URL 形如
    # /static/thumbs\xxx.png（依赖浏览器自动归一化才不裂图，移植性差）
    return f"/{config.THUMBS_DIR}/{name}.png", f"/{config.ORIGINALS_DIR}/{name}.png"


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
