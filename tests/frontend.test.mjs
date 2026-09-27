import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation, stateFromLocation, viewUrl } from '../static/js/navigation.js';
import { getJSON, pointsApiUrl, submitPoint } from '../static/js/api.js';
import { displayName, getPointImages } from '../static/js/points.js';

const categories = [{ name: '挂机果盘点位' }];
const l1 = categories[0].name;

test('分享链接保留层级、全部点位与标签视图的区别', () => {
  const views = [
    { v: 'cats' },
    { v: 'maps', l1 },
    { v: 'groups', l1, l2: '雪夜古堡' },
    { v: 'points', l1, l2: '雪夜古堡', l3: '雪夜古堡II' },
    { v: 'points', l1, l2: '', l3: '' },
    { v: 'points', l1, l2: '雪夜古堡', l3: '' },
    { v: 'points', l1: '', l2: '', l3: '', tag: '技巧 & 路线' },
    { v: 'points', l1: '', l2: '雪夜古堡', l3: '雪夜古堡II' },
  ];
  for (const view of views) {
    const url = new URL(viewUrl(view, '/'), 'https://example.test');
    assert.deepEqual(stateFromLocation(categories, url.search), view);
  }
});

test('旧链接推断层级，失效分类回首页，标签仍可独立访问', () => {
  assert.deepEqual(stateFromLocation(categories, '?l1=失效分类&l2=地图'), { v: 'cats' });
  assert.deepEqual(stateFromLocation(categories, '?l1=失效分类&v=points'), { v: 'cats' });
  assert.deepEqual(stateFromLocation(categories, '?l1=失效分类&tag=技巧'), {
    v: 'points', l1: '', l2: '', l3: '', tag: '技巧',
  });
  assert.deepEqual(stateFromLocation(categories, `?l1=${l1}&l2=主题&l3=地图`), {
    v: 'points', l1, l2: '主题', l3: '地图',
  });
});

// 模拟浏览器历史，检查弹层关闭不会多退一层或重复渲染页面。
function navigationEnvironment(t, search = '') {
  const window = new EventTarget();
  const location = { pathname: '/', search };
  const entries = [{ state: null, url: '/' + search }];
  let index = 0;
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(state, title, url = entries[index].url) {
      entries.splice(++index, Infinity, { state, url });
    },
    replaceState(state, title, url) { entries[index] = { state, url }; },
    back() {
      if (!index) return;
      index--;
      window.dispatchEvent(new Event('popstate'));
    },
    forward() {
      if (index === entries.length - 1) return;
      index++;
      window.dispatchEvent(new Event('popstate'));
    },
  };
  for (const [key, value] of Object.entries({ window, location, history })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  const rendered = [];
  const navigation = createNavigation({ renderView: view => rendered.push(view) });
  navigation.start(categories);
  return { navigation, history, rendered };
}

test('启动恢复 URL，页面前进后退渲染正确层级', t => {
  const { navigation, history, rendered } = navigationEnvironment(t, `?l1=${l1}`);
  assert.deepEqual(rendered, [{ v: 'maps', l1 }]);
  navigation.navigate({ v: 'groups', l1, l2: '主题' });
  navigation.back();
  assert.deepEqual(rendered.at(-1), { v: 'maps', l1 });
  history.forward();
  assert.deepEqual(rendered.at(-1), { v: 'groups', l1, l2: '主题' });
});

for (const marker of ['__modal', '__lb']) {
  test(`${marker}：按钮关闭和系统返回均只关闭弹层，重复打开不残留历史`, t => {
    const { navigation, history, rendered } = navigationEnvironment(t);
    let visible = false;
    navigation.registerOverlay(marker, {
      isOpen: () => visible,
      close: () => { visible = false; navigation.closeOverlay(marker); },
    });
    navigation.navigate({ v: 'maps', l1 });
    for (const closeByBack of [false, true, false, true]) {
      visible = true;
      navigation.openOverlay(marker);
      navigation.openOverlay(marker);
      assert.equal(history.length, 3);
      if (closeByBack) history.back();
      else { visible = false; navigation.closeOverlay(marker); }
      assert.equal(visible, false);
      assert.deepEqual(history.state, { v: 'maps', l1 });
      assert.equal(rendered.length, 1);
    }
    navigation.back();
    assert.deepEqual(rendered.at(-1), { v: 'cats' });
  });
}

test('点位查询编码中文、空格和特殊字符，缺省层级不进入请求', () => {
  const url = new URL(pointsApiUrl({ l1, tag: 'A & B', l2: '', l3: '' }), 'https://example.test');
  assert.deepEqual(Object.fromEntries(url.searchParams), { status: 'approved', l1, tag: 'A & B' });
});

test('API 保留读取错误和投稿业务错误，原样传递多图表单', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: [1] })));
  assert.deepEqual(await getJSON('/api/categories'), [1]);
  fetchMock.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(getJSON('/api/categories'), /HTTP 503/);
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ ok: false, error: '读取失败' })));
  await assert.rejects(getJSON('/api/categories'), /读取失败/);
  const form = new FormData();
  form.append('map_names_l3', '地图一');
  form.append('map_names_l3', '地图二');
  fetchMock.mock.mockImplementation(async (url, options) => {
    assert.equal(url, '/api/submit');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, form);
    return new Response(JSON.stringify({ ok: false, error: '投稿失败' }));
  });
  assert.deepEqual(await submitPoint(form), { ok: false, error: '投稿失败' });
});

test('历史单图数据与多图数据使用相同展示规则', () => {
  assert.equal(displayName('untitle'), '未命名点位');
  assert.equal(displayName(''), '未命名点位');
  assert.equal(displayName('攻略'), '攻略');
  assert.deepEqual(getPointImages({ thumb_url: '/thumb.png', original_url: '/original.png' }), [
    { thumb: '/thumb.png', original: '/original.png' },
  ]);
  const images = [{ thumb: '/1.png', original: '/2.png' }, { thumb: '/3.png', original: '/4.png' }];
  assert.deepEqual(getPointImages({ images }), images);
});
