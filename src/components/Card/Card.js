import React from "react"
import { Link } from "gatsby"
import moment from "moment"
import "./card.scss"

export default function Card({ data, issue }) {
  const {
    node: {
      frontmatter: { description, date, path, title, readingMinutes, posttype },
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
          <h2>{title || description}</h2>
          {description && (
            <p className="dispatch-card__description">{description}</p>
          )}
        </div>
        <div className="dispatch-card__meta">
          {posttype && <span>{posttype.charAt(0).toUpperCase() + posttype.slice(1)}</span>}
          {date && (
            <time dateTime={moment(date).format("YYYY-MM-DD")}>
              {moment(date).format("YYYY.MM.DD")}
            </time>
          )}
          <span>{readingMinutes || timeToRead || 1} min read</span>
        </div>
      </Link>
    </article>
  )
}
