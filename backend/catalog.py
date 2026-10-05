# -*- coding: utf-8 -*-
"""分类文案、地图清单与地图静态图片。"""

import os

from .paths import BASE_DIR


# ---------------------------------------------------------------------------
# 三级联动 基础数据（第一层分类 -> 第二层地图主题 -> 第三层具体地图）
# 地图清单与命名以 tjwiki 仓库（Tom-and-jerry-chase-wiki/src/data/maps.ts）为准
# ---------------------------------------------------------------------------

L1_CATEGORIES = [
    "挂机果盘点位",
    "炸药桶点位",
    "实验性点位",
    "藤蔓点位",
    "贯穿线点位",
]

# 分类配图（图片取自 tjwiki 仓库 public/images/mice/）
L1_CATEGORY_ICONS = {
    "挂机果盘点位": "/static/images/mice/恶魔泰菲.png",
    "炸药桶点位": "/static/images/mice/莱恩.png",
    "实验性点位": "/static/images/mice/航海士杰瑞.png",
    "藤蔓点位": "/static/images/mice/罗宾汉泰菲.png",
    "贯穿线点位": "/static/images/mice/梦游杰瑞.png",
}

# 分类介绍页内容（点击分类后先展示介绍，再进入地图选择）
# 说明：介绍文字由站点作者编写；description 支持 [文字](链接) 语法与裸链接（前端自动转为可点击超链接）。
# 结构：{"description": 介绍段落, "tips": [要点列表]}，字段为空则页面不展示对应区域。
L1_CATEGORY_INFO = {
    "挂机果盘点位": {
        "description": (
            "2025年11月13日，在墙缝期被猫玩家视为心头肉的冰桶不再能阻挡果盘。"
            "自此，挂机果盘得到史诗级加强，其中"
            "[摸鱼酵母](https://space.bilibili.com/34094591/lists/5683355?type=season)"
            "为此作了巨大贡献，"
            "[详见b站摸鱼酵母](https://space.bilibili.com/34094591/lists/5683355?type=season)。"
        ),
        "tips": [],
    },
    "炸药桶点位": {
        "description": (
            "猫鼠元年11月17日，"
            "[秦菌啊](https://space.bilibili.com/33340245)的成名作"
            "[《震惊一时的猫和老鼠打破传统的救人方式——几何桶》](https://www.bilibili.com/video/BV1NJ411S7XE)"
            "发布，炸药桶救人的时代，开始了......此后，炸药桶能被推动的更新、莱恩的问世"
            "推动社区玩家们开发了各种各样充满想象力的救人方法，"
            "再一次感谢各位猫鼠科学家......"
        ),
        "tips": [],
    },
    "实验性点位": {
        "description": (
            "众所周知，单点操作键时投出的道具轨迹是固定的（当然要排除自动瞄准的干扰），"
            "这是否意味着我们可以通过记住点位来打出一些出其不意的效果（视野外针对火箭位置盲投），"
            "拿下本该稳赢的对局（"
            "[站在远处把墙砸开](https://www.bilibili.com/video/BV1ZxyFB6EQ2/?spm_id_from=333.1387.upload.video_card.click)"
            "）。实用性尚待考证，故称之为实验性点位，希望大家多多开发、多多投稿"
        ),
        "tips": [],
    },
    "藤蔓点位": {"description": "", "tips": []},
    "贯穿线点位": {
        "description": (
            "[亦风](https://space.bilibili.com/37845758)？！什么风把猫鼠研究生吹来了？"
            "[亦风](https://space.bilibili.com/37845758)，作为庆典季的老鼠皇，"
            "他并没有躺在荣誉簿里睡大觉，他发明了许多非人类的打法，诸如穿墙果盘、蛋糕花洒破墙。"
            "梦游杰瑞贯穿线，就出自于他的神奇大脑。"
            "想玩好贯穿线不仅要记住位置，还要瞅准鞭炮爆炸时机、把控技能释放，"
            "需要大家结合视频和实战练习，所以也建议各位投稿者在投稿时贴出视频链接，"
            "单单看图片是很难在实战中用出来的哦。"
        ),
        "tips": [],
    },
}

# 分类改名迁移：旧分类 -> 新分类（几何桶/隔墙炸 合并为 炸药桶）
L1_CATEGORY_MIGRATE = {
    "几何桶点位": "炸药桶点位",
    "莱恩隔墙炸点位": "炸药桶点位",
    "投掷物点投点位": "实验性点位",
    "投掷物点投(实验）": "实验性点位",
    "罗宾汉泰菲种树点位": "藤蔓点位",
}

# 常规地图（按主题族分组）
L2_GROUPS = {
    "经典之家": ["经典之家I", "经典之家II", "经典之家III"],
    "雪夜古堡": ["雪夜古堡I", "雪夜古堡II", "雪夜古堡III"],
    "夏日游轮": ["夏日游轮I", "夏日游轮II", "夏日游轮III"],
    "太空堡垒": ["太空堡垒I", "太空堡垒II", "太空堡垒III"],
    "游乐场": ["游乐场"],
    "森林牧场": ["森林牧场"],
    "大都会": ["大都会"],
    "熊猫馆": ["熊猫馆"],
    "御门酒店": ["御门酒店"],
    "天宫": ["天宫", "天宫-云上"],
}


def get_groups_for_l1(l1):
    """第二层：给定分类返回可用地图主题。当前各分类共用一套地图主题。"""
    if l1 not in L1_CATEGORIES:
        return []
    return list(L2_GROUPS.keys())


def get_maps_for_l1_l2(l1, l2):
    """第三层：给定分类+主题 返回具体地图。"""
    if l1 not in L1_CATEGORIES or l2 not in L2_GROUPS:
        return []
    return L2_GROUPS[l2]


# ---------------------------------------------------------------------------
# 地图静态图片（来自 tjwiki 仓库 public/images/maps/）
# thumb = 主题缩略图；full = 整图
# ---------------------------------------------------------------------------

# 主题族缩略图（I/II/III 变体共用主题图；天宫-云上 有独立主题图）
_THEME_THUMBS = {
    "经典之家": "经典之家.png",
    "雪夜古堡": "雪夜古堡.png",
    "夏日游轮": "夏日游轮.png",
    "太空堡垒": "太空堡垒.png",
    "游乐场": "游乐场.png",
    "森林牧场": "森林牧场.png",
    "大都会": "大都会.png",
    "熊猫馆": "熊猫馆.png",
    "御门酒店": "御门酒店.png",
    "天宫": "天宫.png",
    "天宫-云上": "天宫-云上.png",
}

# 地图静态图片目录（绝对路径）与对外 URL 前缀
_MAP_IMAGES_DIR = os.path.join(BASE_DIR, "static", "images", "maps")
_MAP_IMAGES_URL = "/static/images/maps"


def _map_asset(filename):
    """返回 /static/images/maps/<filename>；文件缺失则返回空串，前端据此隐藏占位/横幅。"""
    if not filename:
        return ""
    return (
        f"{_MAP_IMAGES_URL}/{filename}"
        if os.path.exists(os.path.join(_MAP_IMAGES_DIR, filename))
        else ""
    )


def get_map_images(map_name):
    """返回 {thumb, full} 静态图片路径（/static/images/maps/ 下）。
    缩略图：变体（I/II/III）继承主题族缩略图；整图：<地图名>-地图.png。
    任一图片缺失则对应字段为空串，前端隐藏横幅/占位，避免显示裂图。"""
    thumb_file = _THEME_THUMBS.get(map_name)
    if thumb_file is None:
        for group, maps in L2_GROUPS.items():
            if map_name in maps:
                thumb_file = _THEME_THUMBS.get(group)
                break
    return {
        "thumb": _map_asset(thumb_file),
        "full": _map_asset(f"{map_name}-地图.png"),
    }
