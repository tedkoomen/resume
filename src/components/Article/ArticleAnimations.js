import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import ConceptAnimation from "./ConceptAnimation"
const supported = new Set(["counter", "io", "layout", "latency", "mutex", "queue-topology", "queue-cache", "queue-scheduler"])
export default function ArticleAnimations({ bodyRef, html }) {
  const [mounts, setMounts] = useState([])
  useEffect(() => {
    const items = [
      ...bodyRef.current.querySelectorAll("[data-concept-animation]"),
    ]
      .filter(el => supported.has(el.dataset.conceptAnimation))
      .map(slot => {
        const fallback = [...slot.children]
        const mount = document.createElement("div")
        mount.className = "article-animation-mount"
        slot.append(mount)
        return { slot, mount, fallback, type: slot.dataset.conceptAnimation }
      })
    setMounts(items)
    return () => {
      items.forEach(({ mount, fallback }) => {
        mount.remove()
        fallback.forEach(el => {
          el.hidden = false
        })
      })
    }
  }, [bodyRef, html])
  useEffect(() => {
    mounts.forEach(({ fallback }) =>
      fallback.forEach(el => {
        el.hidden = true
      })
    )
  }, [mounts])
  return mounts.map(({ mount, type }, i) =>
    createPortal(<ConceptAnimation type={type} />, mount, `${type}-${i}`)
  )
}
