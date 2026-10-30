import React, { useEffect, useRef, useState } from "react";

export default function ArticleContents({ sections }) {
  const [active, setActive] = useState("");
  const disclosure = useRef(null);
  useEffect(() => {
    if (!sections.length || !disclosure.current) return undefined;
    const media = window.matchMedia("(min-width: 1000px)");
    const syncOpen = () => { disclosure.current.open = media.matches; };
    syncOpen();
    media.addEventListener("change", syncOpen);
    let frame;
    const update = () => {
      frame = null;
      let selected = sections[0]?.id || "";
      for (const { id } of sections) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= 150) selected = id;
      }
      setActive(selected);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      media.removeEventListener("change", syncOpen);
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  if (!sections.length) return null;
  return (
    <aside className="article-contents">
      <details ref={disclosure}>
        <summary>On this page <span>{String(sections.length).padStart(2, "0")} sections</span></summary>
        <nav aria-label="Article contents">
          <ol>{sections.map(({ id, title }, index) => (
            <li key={id}>
              <a href={`#${id}`} aria-current={active === id ? "location" : undefined}
                onClick={() => { if (window.matchMedia("(max-width: 999px)").matches) disclosure.current.open = false; }}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{title}
              </a>
            </li>
          ))}</ol>
        </nav>
      </details>
    </aside>
  );
}
