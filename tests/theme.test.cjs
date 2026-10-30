const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { THEME_KEY, themeInitScript } = require('../src/utils/theme');

function initialize(saved, prefersDark, storageBlocked = false) {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(themeInitScript, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    localStorage: { getItem: key => {
      assert.equal(key, THEME_KEY);
      if (storageBlocked) throw new Error('Storage disabled');
      return saved;
    } },
  });
  return root;
}
test('saved light theme wins over a dark system preference before paint', () => {
  const root = initialize('light', true);
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
});
test('saved dark theme survives a light system preference', () => {
  assert.equal(initialize('dark', false).dataset.theme, 'dark');
});
test('first visit follows the operating system', () => {
  assert.equal(initialize(null, true).dataset.theme, 'dark');
  assert.equal(initialize(null, false).dataset.theme, 'light');
});
test('invalid preferences and blocked storage do not break rendering', () => {
  assert.equal(initialize('invalid', false).dataset.theme, 'light');
  assert.equal(initialize(null, true, true).dataset.theme, 'dark');
});
