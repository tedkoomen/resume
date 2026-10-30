import React, { useEffect, useState } from "react"
import { THEME_KEY, resolveTheme } from "../../utils/theme"

export default function ThemeToggle() {
  const [theme, setTheme] = useState(null)

  const applyTheme = next => {
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = next === "light" ? "#eeece5" : "#242720"
    setTheme(next)
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const syncTheme = () => {
      let saved
      try {
        saved = window.localStorage.getItem(THEME_KEY)
      } catch (_) {}
      applyTheme(resolveTheme(saved, media.matches))
    }
    syncTheme()
    media.addEventListener("change", syncTheme)
    window.addEventListener("storage", syncTheme)
    return () => {
      media.removeEventListener("change", syncTheme)
      window.removeEventListener("storage", syncTheme)
    }
  }, [])

  const toggle = () => {
    const current = document.documentElement.dataset.theme || "light"
    const next = current === "dark" ? "light" : "dark"
    try {
      window.localStorage.setItem(THEME_KEY, next)
    } catch (_) {}
    applyTheme(next)
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={
        theme
          ? `Switch to ${theme === "dark" ? "light" : "dark"} mode`
          : "Switch color theme"
      }
    >
      <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
    </button>
  )
}
