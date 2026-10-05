"""后端行为与部署入口回归；仅使用临时数据，不读取生产配置或发送邮件。"""

import importlib
import importlib.util
from contextlib import closing
import io
import json
import os
import re
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import urljoin
from unittest.mock import patch

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("config", ROOT / "config.example.py")
        cls.config = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.config)
        cls.config.SECRET_KEY = "测试会话密钥"
        cls.config.ADMIN_USERNAME = "测试管理员"
        cls.config.ADMIN_PASSWORD = "测试密码"
        cls.config.SMTP_ENABLED = False
        cls.config_patch = patch.dict(sys.modules, {"config": cls.config})
        cls.config_patch.start()
        cls.entry = importlib.import_module("app")
        cls.app = cls.entry.app
        cls.app.config["TESTING"] = True

    @classmethod
    def tearDownClass(cls):
        cls.config_patch.stop()

    def setUp(self):
        # 放在静态目录下，连同上传图片的 HTTP 访问一并验证。
        self.temp = tempfile.TemporaryDirectory(prefix="backend-test-", dir=ROOT / "static")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        relative = self.directory.relative_to(ROOT).as_posix()
        self.config.DATABASE_PATH = str(self.directory / "test.db")
        self.config.ORIGINALS_DIR = relative + "/originals"
        self.config.THUMBS_DIR = relative + "/thumbs"
        self.entry.init_db()
        self.client = self.app.test_client()

    def form(self, **changes):
        data = {
            "category_l1": "挂机果盘点位",
            "map_group_l2": "经典之家",
            "map_names_l3": ["经典之家I", "经典之家II", "经典之家I"],
            "title": "测试点位",
            "description": "说明 #果盘 #墙角 #果盘",
            "submitter": "测试玩家",
            "submitter_email": "player@example.com",
        }
        data.update(changes)
        return data

    def submit(self, **changes):
        stream = io.BytesIO()
        Image.new("RGB", (800, 400), "red").save(stream, "PNG")
        stream.seek(0)
        data = self.form(**changes)
        data["images"] = (stream, "点位.png")
        return self.client.post("/api/submit", data=data)

    def login(self):
        response = self.client.post("/admin/login", data={
            "username": self.config.ADMIN_USERNAME,
            "password": self.config.ADMIN_PASSWORD,
        })
        self.assertEqual(response.status_code, 200)

    def assert_static_file(self, url):
        with self.client.get(url) as response:
            self.assertEqual(response.status_code, 200)

    def test_route_contract_and_pages(self):
        expected = {
            ("/", "index", "GET"),
            ("/admin", "admin_login", "GET"),
            ("/admin/dashboard", "admin_dashboard", "GET"),
            ("/api/categories", "api_categories", "GET"),
            ("/api/groups", "api_groups", "GET"),
            ("/api/maps", "api_maps", "GET"),
            ("/api/points", "api_points", "GET"),
            ("/api/submit", "api_submit", "POST"),
            ("/admin/login", "admin_do_login", "POST"),
            ("/admin/logout", "admin_logout", "POST"),
            ("/admin/pending", "admin_pending", "GET"),
            ("/admin/approve/<int:point_id>", "admin_approve", "POST"),
            ("/admin/reject/<int:point_id>", "admin_reject", "POST"),
            ("/admin/restore/<int:point_id>", "admin_restore", "POST"),
            ("/admin/delete/<int:point_id>", "admin_delete", "POST"),
            ("/admin/edit/<int:point_id>", "admin_edit", "POST"),
            ("/admin/approve_all", "admin_approve_all", "POST"),
        }
        actual = {(rule.rule, rule.endpoint, method)
                  for rule in self.app.url_map.iter_rules() if rule.endpoint != "static"
                  for method in rule.methods - {"HEAD", "OPTIONS"}}
        self.assertEqual(actual, expected)
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/admin").status_code, 200)
        self.assertEqual(self.client.get("/admin/dashboard").location, "/admin")
        self.assert_static_file("/static/js/main.js")
        self.login()
        self.assertEqual(self.client.get("/admin").location, "/admin/dashboard")
        self.assertEqual(self.client.get("/admin/dashboard").status_code, 200)

    def test_catalog_and_map_assets(self):
        response = self.client.get("/api/categories", headers={"Origin": "https://example.com"})
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://example.com")
        categories = response.json["data"]
        self.assertEqual(len(categories), 5)
        self.assertIn("2025年11月13日", categories[0]["description"])
        for category in categories:
            self.assert_static_file(category["icon"])
            groups = self.client.get("/api/groups", query_string={"l1": category["name"]}).json["data"]
            self.assertTrue(groups)
            for group in groups:
                maps = self.client.get("/api/maps", query_string={
                    "l1": category["name"], "l2": group["name"],
                }).json["data"]
                self.assertTrue(maps)
                for item in maps:
                    for key in ("thumb", "full"):
                        if item[key]:
                            self.assert_static_file(item[key])
        self.assertEqual(self.client.get("/api/groups?l1=不存在").json["data"], [])

    def test_authentication_and_session(self):
        response = self.client.post("/admin/login", data={"username": "错误"})
        self.assertEqual(response.status_code, 401)
        for url, method in (("/admin/pending", "GET"), ("/admin/approve_all", "POST"),
                            *((f"/admin/{action}/1", "POST") for action in
                              ("approve", "reject", "restore", "delete", "edit"))):
            response = self.client.open(url, method=method)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json["error"], "未登录")
        self.login()
        self.assertEqual(self.client.get("/admin/pending").status_code, 200)
        self.client.post("/admin/logout")
        self.assertEqual(self.client.get("/admin/pending").status_code, 401)

    def test_submission_review_edit_restore_and_delete(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200)
        point_id = response.json["id"]
        self.assertEqual(self.client.get("/api/points").json["data"], [])
        self.login()
        item = self.client.get("/admin/pending").json["data"][0]
        self.assertEqual(item["maps"], ["经典之家I", "经典之家II"])
        self.assertEqual(item["tags"], "果盘 墙角")
        self.assertEqual(item["submitter_email"], "player@example.com")
        urls = [item["thumb_url"], item["original_url"]]
        for url, expected_size in zip(urls, [(400, 200), (800, 400)]):
            with self.client.get(url) as image_response:
                self.assertEqual(image_response.status_code, 200)
                with Image.open(io.BytesIO(image_response.data)) as image:
                    self.assertEqual(image.size, expected_size)
        self.assertEqual(self.client.post(f"/admin/approve/{point_id}").status_code, 200)
        public = self.client.get("/api/points", query_string={"l3": "经典之家II", "tag": "果盘"}).json["data"]
        self.assertEqual(len(public), 1)
        self.assertNotIn("submitter_email", public[0])
        self.assertEqual(self.client.get("/api/points?tag=果").json["data"], [])
        response = self.client.post(f"/admin/edit/{point_id}", data=self.form(title="修改标题"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/points").json["data"][0]["title"], "修改标题")
        self.assertEqual(self.client.post(f"/admin/reject/{point_id}").status_code, 200)
        self.assertEqual(self.client.get("/api/points").json["data"], [])
        self.assertEqual(len(self.client.get("/admin/pending?status=rejected").json["data"]), 1)
        self.assertTrue(all((ROOT / url.lstrip("/")).exists() for url in urls))
        self.assertEqual(self.client.post(f"/admin/restore/{point_id}").status_code, 200)
        self.assertEqual(len(self.client.get("/admin/pending").json["data"]), 1)
        self.assertEqual(self.client.post(f"/admin/delete/{point_id}").status_code, 200)
        self.assertFalse(any((ROOT / url.lstrip("/")).exists() for url in urls))
        self.assertEqual(self.client.post(f"/admin/approve/{point_id}").status_code, 404)

    def test_submission_validation_limits_and_filtered_bulk_approval(self):
        self.assertEqual(self.client.post("/api/submit", data=self.form()).status_code, 400)
        self.assertEqual(self.submit(submitter_email="无效邮箱").status_code, 400)
        self.assertEqual(self.submit(map_names_l3=["雪夜古堡I"]).status_code, 400)
        self.assertEqual(self.submit().status_code, 200)
        self.assertEqual(self.submit().status_code, 400)
        self.assertEqual(self.submit(title="另一分类", category_l1="炸药桶点位").status_code, 200)
        for index in range(3):
            self.assertEqual(self.submit(title=f"其他投稿{index}").status_code, 200)
        self.assertEqual(self.submit(title="超过待审核上限").status_code, 400)
        self.login()
        response = self.client.post("/admin/approve_all", query_string={"category_l1": "挂机果盘点位"})
        self.assertEqual(response.json["updated"], 4)
        self.assertEqual(len(self.client.get("/admin/pending").json["data"]), 1)
        self.assertEqual(len(self.client.get("/api/points").json["data"]), 4)
        old_limit = self.app.config["MAX_CONTENT_LENGTH"]
        try:
            self.app.config["MAX_CONTENT_LENGTH"] = 20
            response = self.client.post("/api/submit", data={"description": "x" * 100})
            self.assertEqual(response.status_code, 413)
            self.assertFalse(response.json["ok"])
        finally:
            self.app.config["MAX_CONTENT_LENGTH"] = old_limit

    def test_legacy_database_migration_and_serialization(self):
        self.config.DATABASE_PATH = str(self.directory / "legacy.db")
        with closing(sqlite3.connect(self.config.DATABASE_PATH)) as conn, conn:
            conn.executescript("""
                CREATE TABLE points (
                    id INTEGER PRIMARY KEY, category_l1 TEXT, map_group_l2 TEXT,
                    map_name_l3 TEXT, title TEXT, thumb_url TEXT, original_url TEXT,
                    status TEXT, submitter_email TEXT, created_at TEXT
                );
                INSERT INTO points VALUES (
                    1, '几何桶点位', '经典之家', '经典之家I', '旧描述 #果盘',
                    '', '', 'approved', 'old@example.com', '2025-01-01'
                );
            """)
        self.entry.init_db()
        self.entry.init_db()
        item = self.client.get("/api/points").json["data"][0]
        self.assertEqual(item["category_l1"], "炸药桶点位")
        self.assertEqual(item["title"], "untitle")
        self.assertEqual(item["description"], "旧描述 #果盘")
        self.assertEqual(item["maps"], ["经典之家I"])
        self.assertEqual(item["tags"], "果盘")
        with closing(sqlite3.connect(self.config.DATABASE_PATH)) as conn, conn:
            conn.execute("UPDATE points SET maps = '损坏的 JSON', images = '损坏的 JSON'")
        item = self.client.get("/api/points").json["data"][0]
        self.assertEqual(item["maps"], ["经典之家I"])
        self.assertEqual(item["images"], [])

    def test_wsgi_import_manual_initialization_and_script_startup(self):
        # 子进程从其他工作目录加载根目录入口，验证所有路径仍指向项目根目录。
        config_values = {key: value for key, value in vars(self.config).items()
                         if key.isupper() and isinstance(value, (str, int, bool))}
        config_values["DATABASE_PATH"] = str(self.directory / "startup.db")
        config_values["ORIGINALS_DIR"] += "/startup"
        config_values["THUMBS_DIR"] += "/startup"
        script = """
import json, pathlib, runpy, sys, types
from unittest.mock import patch
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root))
config = types.ModuleType('config')
config.__dict__.update(json.loads(sys.argv[2]))
sys.modules['config'] = config
import app
from flask import Flask
assert isinstance(app.app, Flask)
assert pathlib.Path(app.app.root_path) == root
assert pathlib.Path(app.BASE_DIR) == root
assert not pathlib.Path(config.DATABASE_PATH).exists()
app.init_db()
assert pathlib.Path(config.DATABASE_PATH).exists()
with patch.object(Flask, 'run') as run:
    runpy.run_path(str(root / 'app.py'), run_name='__main__')
run.assert_called_once_with(host='0.0.0.0', port=5000, debug=False)
assert (root / config.ORIGINALS_DIR).is_dir()
assert (root / config.THUMBS_DIR).is_dir()
print('入口兼容验证通过')
"""
        result = subprocess.run(
            [sys.executable, "-c", script, str(ROOT), json.dumps(config_values)],
            cwd=self.directory, capture_output=True, text=True, encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_restart_preserves_records_images_session_and_writes(self):
        """连续启动独立进程，复用持久数据及浏览器会话并继续审核写入。"""
        point_id = self.submit().json["id"]
        self.login()
        self.client.post(f"/admin/approve/{point_id}")
        expected = self.client.get("/api/points").json["data"]
        serializer = self.app.session_interface.get_signing_serializer(self.app)
        cookie = serializer.dumps({"is_admin": True})
        values = {key: value for key, value in vars(self.config).items()
                  if key.isupper() and isinstance(value, (str, int, bool))}
        script = """
import json, pathlib, sys, types
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root))
config = types.ModuleType('config')
config.__dict__.update(json.loads(sys.argv[2]))
sys.modules['config'] = config
import app
app.app.config['TESTING'] = True
client = app.app.test_client(use_cookies=False)
expected = json.loads(sys.argv[3])
headers = {'Cookie': app.app.config['SESSION_COOKIE_NAME'] + '=' + sys.argv[4]}
# 导入即能读取现有库；重复迁移不能改写现有数据。
assert client.get('/api/points').json['data'] == expected
app.init_db()
app.init_db()
assert client.get('/api/points').json['data'] == expected
assert client.get('/admin/dashboard', headers=headers).status_code == 200
for row in expected:
    for url in (row['thumb_url'], row['original_url']):
        with client.get(url) as response:
            assert response.status_code == 200
    point_id = row['id']
    assert client.post(f'/admin/reject/{point_id}', headers=headers).status_code == 200
    assert client.get('/api/points').json['data'] == []
    assert client.post(f'/admin/restore/{point_id}', headers=headers).status_code == 200
    assert client.post(f'/admin/approve/{point_id}', headers=headers).status_code == 200
assert client.get('/api/points').json['data'] == expected
"""
        for restart in range(3):
            with self.subTest(restart=restart):
                result = subprocess.run(
                    [sys.executable, "-c", script, str(ROOT), json.dumps(values),
                     json.dumps(expected), cookie],
                    cwd=self.directory, capture_output=True, text=True,
                    encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with closing(sqlite3.connect(self.config.DATABASE_PATH)) as conn:
            self.assertEqual(conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_split_static_dependencies_are_served(self):
        """从实际页面递归检查拆分脚本与样式，防止发布漏文件导致后台空白。"""
        self.login()
        queue = []
        for page in ("/", "/admin/dashboard"):
            html = self.client.get(page).get_data(as_text=True)
            queue.extend(re.findall(r'(?:src|href)=[\"\'](/static/[^\"\']+\.(?:js|css))[\"\']', html))
        visited = set()
        while queue:
            url = queue.pop()
            if url in visited:
                continue
            visited.add(url)
            with self.client.get(url) as response:
                self.assertEqual(response.status_code, 200, url)
                source = response.get_data(as_text=True)
                if url.endswith(".js"):
                    self.assertIn("javascript", response.content_type, url)
                    dependencies = re.findall(r'(?:from\s+|import\s*)[\"\'](\.[^\"\']+)[\"\']', source)
                else:
                    self.assertIn("text/css", response.content_type, url)
                    dependencies = re.findall(r'@import\s+url\([\"\']([^\"\']+)[\"\']\)', source)
                queue.extend(urljoin(url, dependency) for dependency in dependencies)
        self.assertIn("/static/js/admin-request.js", visited)
        self.assertIn("/static/css/responsive.css", visited)


if __name__ == "__main__":
    unittest.main()
