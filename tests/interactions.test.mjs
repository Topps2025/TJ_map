import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightbox } from '../static/js/lightbox.js';
import { createSubmission } from '../static/js/submission.js';

// 用最小 DOM 替身驱动真实事件处理器，验证跨模块交互状态。
function environment(t) {
  class Element extends EventTarget {
    hidden = true;
    value = '';
    textContent = '';
    style = {};
    options = [];
    checks = [];
    files = [];
    classes = new Set();
    classList = {
      add: c => this.classes.add(c),
      remove: c => this.classes.delete(c),
      contains: c => this.classes.has(c),
      toggle: (c, on) => on ? this.classes.add(c) : this.classes.delete(c),
    };
    set innerHTML(html) {
      this.html = html;
      this.options = [...html.matchAll(/<option value="([^"]*)"/g)].map(m => ({ value: m[1] }));
      this.checks = [...html.matchAll(/<input type="checkbox" value="([^"]*)"/g)].map(m => ({ value: m[1], checked: false }));
    }
    get innerHTML() { return this.html ?? this.textContent.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
    querySelectorAll() { return this.checks; }
    querySelector() { return new Element(); }
    reset() { for (const e of elements.values()) e.value = ''; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const elements = new Map();
  const el = key => {
    if (!elements.has(key)) elements.set(key, new Element());
    return elements.get(key);
  };
  const document = new EventTarget();
  Object.assign(document, {
    querySelector: el, createElement: () => new Element(),
    body: new Element(), documentElement: { scrollTop: 0 },
  });
  const window = { scrollY: 0, confirm: () => true };
  class DataTransfer {
    files = [];
    items = { add: file => this.files.push(file) };
  }
  for (const [key, value] of Object.entries({ document, window, DataTransfer })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  t.mock.method(globalThis, 'fetch', async url => {
    const data = url.startsWith('/api/categories') ? [{ name: '分类甲' }, { name: '分类乙' }]
      : url.startsWith('/api/groups') ? [{ name: '主题甲' }]
      : [{ name: '地图甲' }, { name: '地图乙' }];
    return new Response(JSON.stringify({ ok: true, data }));
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:测试图片');
  const navigation = { openOverlay() {}, closeOverlay() {} };
  return { el, navigation };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('灯箱翻页仅在当前点位内循环，单图点位隐藏翻页按钮', t => {
  const { el, navigation } = environment(t);
  const box = createLightbox({ navigation });
  const points = [
    { title: '点位甲', images: [{ original: '/a' }, { original: '/b' }] },
    { title: '点位乙', images: [{ original: '/c' }] },
  ];
  box.open(points, 0);
  assert.equal(el('#lbTitle').textContent, '点位甲（1/2）');
  el('#lbNext').click();
  assert.equal(el('#lbImg').src, '/b');
  el('#lbNext').click();
  assert.equal(el('#lbImg').src, '/a');
  box.close();
  box.open(points, 1);
  assert.equal(el('#lbImg').src, '/c');
  assert.equal(el('#lbTitle').textContent, '点位乙（1/1）');
  assert.equal(el('#lbNext').hidden, true);
  box.close();
});

test('关闭后换地图再打开投稿，保留标题、图片及原地图；放弃后才重新预填', async t => {
  const { el, navigation } = environment(t);
  let context = { l1: '分类甲', l2: '主题甲', l3: '地图甲' };
  const submission = createSubmission({ navigation, getContext: () => context, onSubmitted() {}, isLightboxOpen: () => false });
  el('#fabSubmit').click();
  await settle();
  el('#fTitle').value = '草稿标题';
  el('#fDesc').value = '草稿说明';
  el('#fImage').files = [{ name: '攻略.png', size: 1024 }];
  el('#fImage').dispatchEvent(new Event('change'));
  assert.equal(el('#fMapList').checks[0].checked, true);
  submission.close();
  await new Promise(resolve => setTimeout(resolve, 200));
  context = { l1: '分类乙', l2: '主题甲', l3: '地图乙' };
  el('#fabSubmit').click();
  await settle();
  assert.equal(el('#fTitle').value, '草稿标题');
  assert.equal(el('#fDesc').value, '草稿说明');
  assert.equal(el('#fCat').value, '分类甲');
  assert.equal(el('#fMapList').checks[0].checked, true);
  assert.equal(el('#fImage').files[0].name, '攻略.png');
  assert.match(el('#fFileList').innerHTML, /攻略.png/);
  el('#discardDraft').click();
  await new Promise(resolve => setTimeout(resolve, 200));
  el('#fabSubmit').click();
  await settle();
  assert.equal(el('#fTitle').value, '');
  assert.equal(el('#fFileList').innerHTML, '');
  assert.equal(el('#fCat').value, '分类乙');
  assert.equal(el('#fMapList').checks[1].checked, true);
  submission.close();
  await new Promise(resolve => setTimeout(resolve, 200));
});

