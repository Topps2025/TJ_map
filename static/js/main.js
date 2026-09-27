import { createNavigation } from './navigation.js';
import { createBrowser } from './browse.js';
import { createPoints } from './points.js';
import { createLightbox } from './lightbox.js';
import { createSubmission } from './submission.js';

// 入口只负责组装依赖并启动；模块通过显式回调协作，不共享可变全局状态。
const navigation = createNavigation({ renderView: view => browser.renderView(view) });
const lightbox = createLightbox({ navigation });
const points = createPoints({ navigate: navigation.navigate, openLightbox: lightbox.open });
const browser = createBrowser({ navigation, points });
const submission = createSubmission({
  navigation,
  getContext: browser.getContext,
  onSubmitted: browser.refreshCurrentData,
  isLightboxOpen: lightbox.isOpen,
});

navigation.registerOverlay('__modal', submission);
navigation.registerOverlay('__lb', lightbox);

async function init() {
  // 分类加载完成后才校验分享链接中的分类并恢复视图。
  await browser.loadCategories();
  navigation.start(browser.getCategories());
}

init();
