import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRequest } from '../static/js/admin-request.js';

test('重启期间连接中断可捕获，恢复后下一次请求成功', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) throw new TypeError('连接中断');
    return new Response(JSON.stringify({ ok: true, data: [] }));
  });
  await assert.rejects(adminRequest('/admin/pending'), /连接中断/);
  assert.deepEqual(await adminRequest('/admin/pending'), { ok: true, data: [] });
  assert.equal(calls, 2);
});

test('重启期间代理返回 HTML 错误页时拒绝请求，不误报操作成功', async context => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response('<html>服务暂不可用</html>', { status: 502 }));
  await assert.rejects(adminRequest('/admin/approve/1', { method: 'POST' }));
});

test('HTTP 错误即使带有成功字段也不能当作成功', async context => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ ok: true }), { status: 503 }));
  await assert.rejects(adminRequest('/admin/pending'), /HTTP 503/);
});

test('后台操作成功响应可以没有 data，仍视为成功', async context => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ ok: true, message: '已保存' })));
  assert.deepEqual(await adminRequest('/admin/edit/1', { method: 'POST' }), {
    ok: true, message: '已保存',
  });
});

test('后台业务错误保留服务端提示', async context => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ ok: false, error: '记录不存在' }), { status: 404 }));
  await assert.rejects(adminRequest('/admin/edit/1', { method: 'POST' }), /记录不存在/);
});

test('会话过期跳转登录页且不尝试解析响应数据', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: '/admin/dashboard' } });
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
    else delete globalThis.location;
  });
  context.mock.method(globalThis, 'fetch', async () =>
    new Response('未登录', { status: 401 }));
  assert.equal(await adminRequest('/admin/pending'), null);
  assert.equal(location.href, '/admin');
});
