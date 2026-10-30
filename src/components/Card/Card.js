import React from "react"
import { Link } from "gatsby"
import moment from "moment"
import "./card.scss"

export default function Card({ data, issue }) {
  const {
    node: {
      frontmatter: { description, date, path, title },
      timeToRead,
    },
  } = data
  const issueNumber = String(issue || 1).padStart(3, "0")
  return (
    <article className="dispatch-card">
      <Link to={path} className="dispatch-card__link">
        <span
          className="dispatch-card__issue"
          aria-label={`Article ${issueNumber}`}
        >
          {issueNumber}
        </span>
        <div className="dispatch-card__body">
          <h2>
            {title || description}{" "}
            <span className="dispatch-card__arrow" aria-hidden="true">
              ↗
            </span>
          </h2>
          {description && (
            <p className="dispatch-card__description">{description}</p>
          )}
        </div>
        <div className="dispatch-card__meta">
          {date && (
            <time dateTime={moment(date).format("YYYY-MM-DD")}>
              {moment(date).format("YYYY.MM.DD")}
            </time>
          )}
          <span>{timeToRead || 1} min read</span>
        </div>
      </Link>
    </article>
  )
}
