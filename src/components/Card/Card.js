import React from "react";
import { Link } from "gatsby";
import moment from "moment";
import "./card.scss";

const formatPostType = (posttype) => (posttype || "article").replace(/-/g, " ");

export default ({ data, issue }) => {
  const {
    node: {
      frontmatter: { description, posttype, date, path, title },
      timeToRead,
    },
  } = data;

  const formattedDate = date ? moment(date).format("YYYY-MM-DD") : "Undated";
  const issueNumber = String(issue || 1).padStart(3, "0");

  return (
    <article className="dispatch-card">
      <Link to={path} className="dispatch-card__link">
        <div className="dispatch-card__issue" aria-label={`Article ${issueNumber}`}>
          <span>{issueNumber}</span>
          <i aria-hidden="true" />
        </div>
        <div className="dispatch-card__body">
          <p className="dispatch-card__kicker">{formatPostType(posttype)}</p>
          <h2>{title || description}</h2>
          {description && <p className="dispatch-card__description">{description}</p>}
          <span className="dispatch-card__cta">Read article →</span>
        </div>
        <dl className="dispatch-card__meta">
          <div>
            <dt>Filed</dt>
            <dd>{formatPostType(posttype)}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formattedDate}</dd>
          </div>
          <div>
            <dt>Read</dt>
            <dd>{timeToRead || 1} min</dd>
          </div>
        </dl>
      </Link>
    </article>
  );
};
