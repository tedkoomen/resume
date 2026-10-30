import React, { memo, useEffect, useRef } from "react";
import { responsiveDiagram } from "../../utils/article-sections";

// Mermaid has a shared configuration; serialize renders across route/theme changes.
let renderQueue = Promise.resolve();
let diagramId = 0;

function ArticleBody({ html }) {
  const root = useRef(null);
  useEffect(() => {
    const codes = [...root.current.querySelectorAll("pre > code.language-mermaid")];
    if (!codes.length) return undefined;
    let disposed = false;
    let revision = 0;
    const narrow = window.matchMedia("(max-width: 640px)");
    const diagrams = codes.map((code, index) => {
      const source = code.textContent;
      const original = code.closest(".gatsby-highlight") || code.parentElement;
      const figure = document.createElement("figure");
      figure.className = "article-diagram";
      figure.dataset.diagramState = "loading";
      const caption = document.createElement("figcaption");
      const title = source.match(/^\s*accTitle:\s*(.+)$/m)?.[1] || `Diagram ${index + 1}`;
      caption.textContent = title;
      const viewport = document.createElement("div");
      viewport.className = "article-diagram__viewport";
      viewport.setAttribute("role", "region");
      viewport.setAttribute("aria-label", title);
      viewport.tabIndex = 0;
      const status = document.createElement("p");
      status.className = "article-diagram__status";
      status.setAttribute("role", "status");
      status.textContent = "Rendering diagram…";
      const details = document.createElement("details");
      details.className = "article-diagram__source";
      const summary = document.createElement("summary");
      summary.textContent = "View diagram source";
      const pre = document.createElement("pre");
      pre.textContent = source;
      details.append(summary, pre);
      const hint = document.createElement("p");
      hint.className = "article-diagram__hint";
      hint.textContent = "↔ Scroll to explore the full diagram";
      hint.hidden = true;
      figure.append(caption, status, viewport, hint, details);
      original.replaceWith(figure);
      return { source, original, figure, viewport, status, details, hint };
    });

    const redraw = () => {
      const version = ++revision;
      const current = () => !disposed && version === revision;
      renderQueue = renderQueue.catch(() => {}).then(async () => {
        if (!current()) return;
        try {
          const { default: mermaid } = await import("mermaid");
          await document.fonts.ready;
          if (!current()) return;
          const styles = getComputedStyle(document.documentElement);
          const color = name => styles.getPropertyValue(name).trim();
          const ink = color("--void-cream");
          const panel = color("--void-panel");
          const accent = color("--void-accent");
          const theme = document.documentElement.dataset.theme || "light";
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: "base",
            fontFamily: "IBM Plex Mono, monospace",
            themeVariables: {
              darkMode: theme === "dark", fontFamily: "IBM Plex Mono, monospace", fontSize: "14px",
              background: color("--void-black"), primaryColor: panel,
              primaryTextColor: ink, primaryBorderColor: accent, lineColor: ink,
              secondaryColor: panel, tertiaryColor: panel, textColor: ink,
              mainBkg: panel, nodeBorder: accent, edgeLabelBackground: color("--void-black"),
              actorBkg: panel, actorBorder: accent, actorTextColor: ink,
              actorLineColor: color("--void-line-strong"), signalColor: ink, signalTextColor: ink,
              labelBoxBkgColor: panel, labelBoxBorderColor: accent, labelTextColor: ink,
              noteBkgColor: panel, noteTextColor: ink, noteBorderColor: accent,
            },
            flowchart: { htmlLabels: false, useMaxWidth: true, nodeSpacing: 24, rankSpacing: 28 },
            sequence: { useMaxWidth: true, wrap: true, actorMargin: 25, width: 100, messageMargin: 35, mirrorActors: false },
          });
          for (const item of diagrams) {
            if (!current()) return;
            try {
              const { svg } = await mermaid.render(`article-diagram-${++diagramId}`, responsiveDiagram(item.source, narrow.matches));
              if (!current()) return;
              item.viewport.innerHTML = svg;
              const drawing = item.viewport.querySelector("svg");
              if (!narrow.matches) drawing.style.minWidth = `${drawing.viewBox.baseVal.width}px`;
              item.hint.hidden = item.viewport.scrollWidth <= item.viewport.clientWidth;
              item.status.hidden = true;
              item.figure.dataset.diagramState = "ready";
              item.figure.dataset.renderTheme = theme;
            } catch (error) {
              if (!current()) return;
              item.status.textContent = "Diagram unavailable. You can read its source below.";
              item.status.hidden = false;
              item.details.open = true;
              item.figure.dataset.diagramState = "error";
              console.warn("Article diagram could not be rendered", error);
            }
          }
        } catch (error) {
          if (!current()) return;
          diagrams.forEach(item => {
            item.status.textContent = "Diagram unavailable. You can read its source below.";
            item.status.hidden = false;
            item.details.open = true;
            item.figure.dataset.diagramState = "error";
          });
          console.warn("Article diagram renderer could not load", error);
        }
      });
    };
    const sizeObserver = new ResizeObserver(() => {
      diagrams.forEach(item => { item.hint.hidden = item.viewport.scrollWidth <= item.viewport.clientWidth; });
    });
    diagrams.forEach(item => sizeObserver.observe(item.viewport));
    const observer = new MutationObserver(redraw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    narrow.addEventListener("change", redraw);
    redraw();
    return () => {
      disposed = true;
      observer.disconnect();
      sizeObserver.disconnect();
      narrow.removeEventListener("change", redraw);
      // Restore the original nodes for StrictMode's second setup.
      diagrams.forEach(({ figure, original }) => {
        if (figure.isConnected) figure.replaceWith(original);
      });
    };
  }, [html]);

  return <div className="dispatch-body" ref={root} dangerouslySetInnerHTML={{ __html: html }} />;
}
export default memo(ArticleBody);
