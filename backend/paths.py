# -*- coding: utf-8 -*-
"""统一项目根目录，避免拆分后数据库和图片路径发生变化。"""

import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
