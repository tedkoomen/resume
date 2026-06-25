import React from "react";
import { graphql, Link } from "gatsby";
import Layout from "../components/Layout/Layout";
import Seo from "../components/seo";
import moment from "moment";
import "./engineeringPost.scss";

const formatPostType = (posttype) => (posttype || "dispatch").replace(/-/g, " ");

export default ({ data, location }) => {
  if (!data?.markdownRemark) {
    return null;
  }

  const { date, title, description, posttype, snippet, featuredImage, author, dispatch } =
    data.markdownRemark.frontmatter;

  const post = data.markdownRemark;
  const seoImage = featuredImage?.childImageSharp?.resize;
  const formattedDate = date ? moment(date).format("YYYY-MM-DD") : "Undated";

  return (
    <Layout>
      <Seo
        title={title}
        description={description}
        pathname={location.pathname}
        image={seoImage}
      />
      <article className="dispatch-page">
        <header className="dispatch-hero">
          <Link className="dispatch-hero__back" to="/">
            ← Back to articles
          </Link>
          <div className="dispatch-hero__grid">
            <div className="dispatch-hero__main">
              <p className="dispatch-hero__kicker">
                Dispatch {dispatch ? String(dispatch).padStart(3, "0") : ""} / {formatPostType(posttype)}
              </p>
              <h1>{title}</h1>
              {description && <p className="dispatch-hero__description">{description}</p>}
              {snippet && <p className="dispatch-hero__snippet">{snippet}</p>}
              <p className="dispatch-hero__byline">by {author || "Ted Koomen"}</p>
            </div>
            <dl className="dispatch-hero__meta">
              <div>
                <dt>Date</dt>
                <dd>{formattedDate}</dd>
              </div>
              <div>
                <dt>Reading time</dt>
                <dd>{post.timeToRead || 1} min read</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{formatPostType(posttype)}</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="dispatch-body">
          <div dangerouslySetInnerHTML={{ __html: post.html }} />
        </div>

        <nav className="dispatch-after" aria-label="Article navigation">
          <Link to="/blog/">View archive →</Link>
        </nav>
      </article>
    </Layout>
  );
};

export const pageQuery = graphql`
  query EngineeringPostByPath($pathSlug: String!) {
    markdownRemark(frontmatter: { path: { eq: $pathSlug } }) {
      html
      timeToRead
      frontmatter {
        path
        date
        title
        description
        posttype
        snippet
        author
        dispatch
        featuredImage {
          childImageSharp {
            resize(width: 1200) {
              src
              height
              width
            }
          }
        }
      }
    }
  }
`;
