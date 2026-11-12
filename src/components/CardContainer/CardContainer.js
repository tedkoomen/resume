import React, { useState } from "react"
import Card from "../Card/Card"
import "./cardContainer.scss"

const CardContainer = ({ containerTitle, data }) => {
  const [selectedType, setSelectedType] = useState("all")
  const types = [...new Set(data.map(({ node }) => node.frontmatter.posttype).filter(Boolean))].sort()
  const visiblePosts = data.filter(({ node }) => selectedType === "all" || node.frontmatter.posttype === selectedType)
  const renderContainerTitle = () => {
    if (!containerTitle) {
      return null
    }

    return (
      <h2 className="dispatch-list__title">
        {containerTitle}
      </h2>
    )
  }

  const renderCards = () =>
    visiblePosts.map(obj => (
      <Card
        data={obj}
        issue={data.length - data.indexOf(obj)}
        key={obj.node.frontmatter.path}
      />
    ))

  return (
    <section className="dispatch-list">
      <div className="dispatch-list__header">
        {renderContainerTitle()}
        <span className="dispatch-list__count" aria-live="polite">
          {visiblePosts.length} {visiblePosts.length === 1 ? "entry" : "entries"} / newest first
        </span>
      </div>
      {types.length > 1 && <div className="dispatch-list__filters" role="group" aria-label="Filter articles by category">
        {["all", ...types].map(type => <button
          key={type}
          type="button"
          aria-pressed={selectedType === type}
          onClick={() => setSelectedType(type)}
        >{type === "all" ? "All writing" : type.charAt(0).toUpperCase() + type.slice(1)}</button>)}
      </div>}
      <div className="dispatch-list__items">{renderCards()}</div>
    </section>
  )
}

export default CardContainer
