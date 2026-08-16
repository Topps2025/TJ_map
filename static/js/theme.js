/* ============================================================
   深色模式（对齐 tjwiki：class 切换 + localStorage，默认跟随系统）
   ============================================================ */

(function () {
  'use strict';

  var KEY = 'darkMode';

  function initialDark() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) return saved === 'dark';
    } catch (e) { /* ignore */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  document.documentElement.classList.toggle('dark', initialDark());

  function bindToggle() {
    var btn = document.getElementById('darkToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var dark = document.documentElement.classList.toggle('dark');
      try {
        localStorage.setItem(KEY, dark ? 'dark' : 'light');
      } catch (e) { /* ignore */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle);
  } else {
    bindToggle();
  }
})();
