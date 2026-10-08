import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightbox } from '../static/js/lightbox.js';
import { createSubmission } from '../static/js/submission.js';
import { createBrowser } from '../static/js/browse.js';
import { createSidebar } from '../static/js/sidebar.js';

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
    attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    contains(element) { return this === element || this.checks.includes(element); }
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
    querySelectorAll(selector) { return selector.endsWith(':checked') ? this.checks.filter(c => c.checked) : this.checks; }
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
    querySelector: el, querySelectorAll: () => [], createElement: () => new Element(),
    body: new Element(), documentElement: { scrollTop: 0 },
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  const window = { scrollY: 0, confirm: () => true, scrollTo() {}, matchMedia: () => media };
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
  t.after(() => clearTimeout(el('#toast')._timer));
  return { el, navigation, media };
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


// 手动控制网络响应顺序，稳定复现慢请求覆盖新状态的问题。
function deferredRequests(t) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', url => new Promise((resolve, reject) => {
    requests.push({ url, reject, respond: data => resolve(new Response(JSON.stringify({ ok: true, data }))) });
  }));
  return requests;
}

function browserEnvironment(t) {
  const env = environment(t);
  const rendered = [], previews = [];
  const browser = createBrowser({ navigation: env.navigation, points: {
    renderSkeleton() {}, renderPoints: data => rendered.push(data),
    loadPreview: url => previews.push(url),
  } });
  return { ...env, browser, rendered, previews, requests: deferredRequests(t) };
}

test('点位快速切换时，旧请求成功或失败均不覆盖新页面', async t => {
  const { browser, requests, rendered, el } = browserEnvironment(t);
  browser.renderView({ v: 'points', l3: '旧地图' });
  browser.renderView({ v: 'points', l3: '新地图' });
  requests[1].respond([{ title: '新点位' }]);
  await settle();
  requests[0].respond([{ title: '旧点位' }]);
  await settle();
  assert.deepEqual(rendered, [[{ title: '新点位' }]]);
  browser.renderView({ v: 'points', l3: '失败地图' });
  browser.renderView({ v: 'cats' });
  el('#pointsGrid').innerHTML = '保留内容';
  requests[2].reject(new Error('网络错误'));
  await settle();
  assert.equal(el('#pointsGrid').innerHTML, '保留内容');
});

test('主题加载失败时显示当前主题的错误区域，允许返回分类', async t => {
  const { browser, requests, el } = browserEnvironment(t);
  browser.renderView({ v: 'cats' });
  browser.renderView({ v: 'groups', l1: '分类甲', l2: '主题甲' });
  requests[0].reject(new Error('网络错误'));
  await settle();
  assert.equal(el('#layer3').hidden, false);
  assert.match(el('#mapChips').innerHTML, /地图加载失败/);
});

test('主题旧请求失败不覆盖后来成功加载的主题', async t => {
  const { browser, requests, el } = browserEnvironment(t);
  browser.renderView({ v: 'groups', l1: '分类甲', l2: '旧主题' });
  browser.renderView({ v: 'groups', l1: '分类甲', l2: '新主题' });
  requests[1].respond([{ name: '新地图' }]);
  await settle();
  requests[0].reject(new Error('旧请求失败'));
  await settle();
  assert.match(el('#mapChips').innerHTML, /新地图/);
});

test('投稿后刷新中的旧点位请求不覆盖切换后的地图', async t => {
  const { browser, requests, rendered } = browserEnvironment(t);
  browser.renderView({ v: 'points', l1: '分类甲', l2: '主题甲', l3: '旧地图' });
  requests[0].respond([]);
  await settle();
  browser.refreshCurrentData();
  browser.renderView({ v: 'points', l1: '分类甲', l2: '主题甲', l3: '新地图' });
  requests[2].respond([{ title: '新点位' }]);
  await settle();
  requests[1].respond([{ title: '旧点位' }]);
  await settle();
  assert.deepEqual(rendered.at(-1), [{ title: '新点位' }]);
});

for (const scope of [{}, { l1: '分类甲' }, { l1: '分类甲', l2: '主题甲' }]) {
  test(`全部点位视图投稿后刷新列表：${JSON.stringify(scope)}`, async t => {
    const { browser, requests, previews } = browserEnvironment(t);
    browser.renderView({ v: 'points', ...scope });
    requests[0].respond([]);
    await settle();
    browser.refreshCurrentData();
    assert.equal(requests.length, 2);
    assert.equal(previews.length, 0);
    requests[1].respond([]);
    await settle();
  });
}

test('投稿预填主题请求尚未完成时改分类，不得覆盖用户手动选择', async t => {
  const { el, navigation } = environment(t);
  const requests = deferredRequests(t);
  const submission = createSubmission({ navigation, getContext: () => ({ l1: '分类甲', l2: '主题甲', l3: '地图甲' }), onSubmitted() {}, isLightboxOpen: () => false });
  el('#fabSubmit').click();
  requests[0].respond([{ name: '分类甲' }, { name: '分类乙' }]);
  await settle();
  el('#fCat').value = '分类乙';
  el('#fCat').dispatchEvent(new Event('change'));
  requests[2].respond([{ name: '主题甲' }, { name: '主题乙' }]);
  await settle();
  el('#fGroup').value = '主题乙';
  el('#fGroup').dispatchEvent(new Event('change'));
  requests[3].respond([{ name: '地图乙' }]);
  await settle();
  el('#fMapList').checks[0].checked = true;
  requests[1].respond([{ name: '主题甲' }]);
  await settle();
  assert.equal(el('#fGroup').value, '主题乙');
  assert.equal(el('#fMapList').checks[0].checked, true);
  assert.equal(requests.length, 4);
  submission.close();
  await new Promise(resolve => setTimeout(resolve, 200));
});

test('移动侧栏默认关闭，支持打开、Escape 关闭及断点切换', t => {
  const { el, media } = environment(t);
  media.matches = true;
  createSidebar();
  assert.equal(el('#layer1').inert, true);
  el('#mobileSidebarToggle').click();
  assert.equal(el('#layer1').inert, false);
  assert.equal(el('#sidebarBackdrop').hidden, false);
  assert.equal(el('#mobileSidebarToggle').attributes['aria-expanded'], 'true');
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(el('#layer1').inert, true);
  assert.equal(document.activeElement, el('#mobileSidebarToggle'));
  el('#mobileSidebarToggle').click();
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  assert.equal(el('#layer1').inert, false);
  assert.equal(el('#sidebarBackdrop').hidden, true);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.equal(el('#layer1').inert, true);
});
