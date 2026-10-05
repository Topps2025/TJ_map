# -*- coding: utf-8 -*-
"""投稿字段校验、标签提取与点位序列化。"""

import json
import re

from .catalog import L1_CATEGORIES, L2_GROUPS


def _extract_tags(description):
    """从描述中提取 # 标签，如 '#果盘 #墙角' -> '果盘 墙角'（去重、保持顺序）。"""
    if not description:
        return ''
    tags = re.findall(r"#([^\s#]+)", description)
    seen = set()
    uniq = [t for t in tags if not (t in seen or seen.add(t))]
    return " ".join(uniq)


def _parse_maps(row):
    """解析 maps JSON（多地图列表），空则回退为主地图 map_name_l3。"""
    try:
        maps = json.loads(row.get("maps") or "[]")
    except (ValueError, TypeError):
        maps = []
    if not isinstance(maps, list) or not maps:
        maps = [row["map_name_l3"]] if row.get("map_name_l3") else []
    return maps


def _serialize_point(row, include_email=False):
    """把数据库行转为对外 JSON 对象：解析 images/maps。
    include_email=False 时剔除 submitter_email（前台点位接口不泄露邮箱），
    后台接口传 True 以便审核/发邮件。"""
    item = dict(row)
    if not include_email:
        item.pop("submitter_email", None)
    try:
        item["images"] = json.loads(item.get("images") or "[]")
    except (ValueError, TypeError):
        item["images"] = []
    item["maps"] = _parse_maps(item)
    return item


def _validate_submission(form):
    """校验并归一化投稿/编辑表单的公共字段（分类/主题/地图/标题/描述/投稿人/邮箱）。

    成功返回 (payload, None)；失败返回 (None, error_message)（调用方按 400 返回）。
    payload 字段：category_l1, map_group_l2, map_name_l3(主地图), maps(JSON 字符串),
                  title, description, submitter, submitter_email, tags(由描述提取)。
    图片相关校验仅投稿接口需要，留在 api_submit 内单独处理。
    """
    category_l1 = form.get("category_l1", "").strip()
    map_group_l2 = form.get("map_group_l2", "").strip()
    # 具体地图多选（兼容旧的单值 map_name_l3）
    map_names = [m.strip() for m in form.getlist("map_names_l3") if m.strip()]
    if not map_names:
        single = form.get("map_name_l3", "").strip()
        if single:
            map_names = [single]
    title = form.get("title", "").strip()
    description = form.get("description", "").strip()
    submitter = form.get("submitter", "").strip()
    submitter_email = form.get("submitter_email", "").strip()

    if category_l1 not in L1_CATEGORIES:
        return None, "请选择有效的分类"
    if map_group_l2 not in L2_GROUPS:
        return None, "请选择有效的地图主题"
    if not map_names:
        return None, "请至少选择一个具体地图"
    for m in map_names:
        if m not in L2_GROUPS[map_group_l2]:
            return None, f"地图「{m}」不属于该主题"
    if not title:
        return None, "请填写标题"
    if len(title) > 60:
        return None, "标题最长 60 字"
    if len(description) > 300:
        return None, "点位描述最长 300 字"
    if not submitter:
        return None, "请填写投稿人"
    if len(submitter) > 30:
        return None, "投稿人昵称最长 30 字"
    if not submitter_email:
        return None, "请填写投稿人邮箱"
    if not re.match(r"^[\w.\-+]+@[\w\-]+(\.[\w\-]+)+$", submitter_email):
        return None, "邮箱格式不正确"

    # 去重并保持选择顺序；map_name_l3 记主地图（第一个）
    seen = set()
    maps_deduped = [m for m in map_names if not (m in seen or seen.add(m))]
    return {
        "category_l1": category_l1,
        "map_group_l2": map_group_l2,
        "map_name_l3": maps_deduped[0],
        "maps": json.dumps(maps_deduped, ensure_ascii=False),
        "title": title,
        "description": description,
        "submitter": submitter,
        "submitter_email": submitter_email,
        "tags": _extract_tags(description),
    }, None
