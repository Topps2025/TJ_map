# -*- coding: utf-8 -*-
"""数据库连接、初始化、旧数据迁移与点位查询。"""

import os
import sqlite3

import config

from .catalog import L1_CATEGORY_MIGRATE
from .paths import BASE_DIR
from .points import _extract_tags


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
    # 旧分类名迁移（几何桶/隔墙炸 -> 炸药桶；点投/种树 -> 新名）
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


def _find_point(point_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM points WHERE id = ?", (point_id,)).fetchone()
    conn.close()
    return row
