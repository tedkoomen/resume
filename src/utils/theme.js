// Shared with the pre-paint script so hydration and navigation use one policy.
const THEME_KEY = "tedkoomen-theme"
const resolveTheme = (saved, prefersDark) =>
  saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light"

const themeInitScript = `(function () {
  var saved;
  try { saved = localStorage.getItem(${JSON.stringify(
    THEME_KEY
  )}); } catch (_) {}
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = (${resolveTheme.toString()})(saved, dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`
module.exports = { THEME_KEY, resolveTheme, themeInitScript }
