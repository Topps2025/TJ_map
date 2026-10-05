# -*- coding: utf-8 -*-
"""管理员和投稿人邮件通知。"""

import smtplib
from email.header import Header
from email.mime.text import MIMEText

from flask import current_app

import config


def send_email(to_addr, subject, body):
    """通用邮件发送（QQ SMTP）。失败静默，不影响主流程。"""
    if not config.SMTP_ENABLED or not config.SMTP_HOST or not to_addr:
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["From"] = config.SMTP_USERNAME
        msg["To"] = to_addr
        msg["Subject"] = Header(subject, "utf-8")

        if config.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
        server.sendmail(config.SMTP_USERNAME, [to_addr], msg.as_string())
        server.quit()
    except Exception as e:
        current_app.logger.warning("邮件发送失败: %s", e)


def send_notify_email(title, submitter, submitter_email):
    """向管理员发送投稿通知（含问候语）。失败静默。"""
    body = (
        "您好，管理员：\n\n"
        "有一位玩家向【猫和老鼠手游点位查询】提交了新点位，请前往后台审核。\n\n"
        f"点位标题：{title or 'untitle'}\n"
        f"投稿人：{submitter or '（未填写）'}\n"
        f"投稿人邮箱：{submitter_email or '（未填写）'}\n\n"
        "审核地址：/admin\n"
    )
    send_email(config.ADMIN_NOTIFY_EMAIL, config.EMAIL_SUBJECT, body)


def send_submitter_email(submitter, to_addr, status, title, reason=""):
    """向投稿人发送邮件（问候语 + 状态通知）。失败静默。"""
    greet = f"您好，{submitter or '玩家'}："
    name = title or "untitle"
    if status == "submitted":
        subject = "【猫和老鼠点位】投稿已收到"
        body = (
            f"{greet}\n\n"
            f"感谢您向【猫和老鼠手游点位查询】投稿！\n"
            f"您的点位《{name}》已收到，审核通过后将在对应地图下展示。\n\n"
            "祝您游戏愉快！\n"
        )
    elif status == "approved":
        subject = "【猫和老鼠点位】投稿已通过审核"
        body = (
            f"{greet}\n\n"
            f"您投稿的点位《{name}》已通过审核并展示，感谢您的贡献！\n\n"
            "祝您游戏愉快！\n"
        )
    else:
        subject = "【猫和老鼠点位】投稿未通过审核"
        body = (
            f"{greet}\n\n"
            f"很遗憾，您投稿的点位《{name}》未通过审核，不会在站点展示。\n"
            + (f"拒绝原因：{reason}\n" if reason else "")
            + "\n如有疑问可重新投稿，祝您游戏愉快！\n"
        )
    send_email(to_addr, subject, body)
