# -*- coding: utf-8 -*-
"""演示数据初始化：生成占位 WebP 图片并写入若干“已审核”点位。
用法：python seed_demo.py
"""
import os
import sqlite3

from PIL import Image, ImageDraw, ImageFont

import app as server

BASE_DIR = server.BASE_DIR
THUMBS = os.path.join(BASE_DIR, server.config.THUMBS_DIR)
ORIGINALS = os.path.join(BASE_DIR, server.config.ORIGINALS_DIR)
os.makedirs(THUMBS, exist_ok=True)
os.makedirs(ORIGINALS, exist_ok=True)

CATEGORIES = server.L1_CATEGORIES
GROUPS = server.L2_GROUPS

COLORS = ["#f94144", "#f8961e", "#90be6d", "#43aa8b", "#577590", "#f9844a"]


def make_placeholder(name, idx, w=400, h=300):
    img = Image.new("RGB", (w, h), COLORS[idx % len(COLORS)])
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
    except Exception:
        font = ImageFont.load_default()
    draw.rectangle([0, 0, w - 1, h - 1], outline="#ffffff", width=6)
    text = f"点位 {name} #{idx + 1}"
    tw, th = draw.textbbox((0, 0), text, font=font)[2:4]
    draw.text(((w - tw) / 2, (h - th) / 2), text, fill="#ffffff", font=font)
    return img


def main():
    server.init_db()

    if server.get_db().execute("SELECT COUNT(*) c FROM points").fetchone()["c"] > 0:
        print("已存在数据，跳过演示数据。")
        return

    conn = server.get_db()
    count = 0
    group_list = list(GROUPS.items())
    for ci, cat in enumerate(CATEGORIES):
        for gi, (group, maps) in enumerate(group_list):
            for mi, m in enumerate(maps):
                if count >= 12:
                    break
                base = f"{ci}{gi}{mi}"
                # 原图
                img_orig = make_placeholder(m, count, w=800, h=600)
                oname = f"demo_{base}.webp"
                img_orig.save(os.path.join(ORIGINALS, oname), "WEBP", quality=90)
                # 缩略图
                img_thumb = make_placeholder(m, count, w=400, h=300)
                tname = f"demo_{base}.webp"
                img_thumb.save(os.path.join(THUMBS, tname), "WEBP", quality=80)

                conn.execute(
                    "INSERT INTO points (category_l1, map_group_l2, map_name_l3, title, "
                    "thumb_url, original_url, status, submitter_email, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, 'approved', '', datetime('now', 'localtime'))",
                    (cat, group, m, f"演示点位：{m} 的 {cat} 示例",
                     f"/static/thumbs/{tname}", f"/static/originals/{oname}"),
                )
                count += 1
                if count >= 12:
                    break
            if count >= 12:
                break
        if count >= 12:
            break
    conn.commit()
    conn.close()
    print(f"已写入 {count} 条演示点位。")


if __name__ == "__main__":
    main()
