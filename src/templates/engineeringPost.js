import React, { useMemo } from "react"
import { graphql, Link } from "gatsby"
import Layout from "../components/Layout/Layout"
import Seo from "../components/seo"
import moment from "moment"
import ArticleBody from "../components/Article/ArticleBody"
import ArticleContents from "../components/Article/ArticleContents"
import { getArticleSections } from "../utils/article-sections"
import "./engineeringPost.scss"

const formatPostType = posttype => (posttype || "article").replace(/-/g, " ")

export default ({ data, location, pageContext }) => {
  const sections = useMemo(() => getArticleSections(data?.markdownRemark?.headings || []), [data?.markdownRemark?.headings])
  if (!data?.markdownRemark) {
    return null
  }

  const {
    date,
    title,
    description,
    posttype,
    featuredImage,
    author,
    takeaways,
  } = data.markdownRemark.frontmatter

  const post = data.markdownRemark
  const seoImage = featuredImage?.childImageSharp?.resize
  const formattedDate = date ? moment(date).format("YYYY-MM-DD") : "Undated"
  const issueNumber = String(pageContext?.issueNumber || 1).padStart(3, "0")

  return (
    <Layout>
      <Seo
        title={title}
        description={description}
        pathname={location.pathname}
        image={seoImage}
        article
      />
      <article className="dispatch-page">
        <header className="dispatch-hero">
          <Link className="dispatch-hero__back" to="/">
            ← writing /
          </Link>
          <div className="dispatch-hero__grid">
            <div className="dispatch-hero__main">
              <p className="dispatch-hero__kicker">
                Article {issueNumber} / {formatPostType(posttype)}
              </p>
              <h1>{title}</h1>
              {description && (
                <p className="dispatch-hero__description">{description}</p>
              )}
              <p className="dispatch-hero__byline">
                by {author || "Ted Koomen"}
              </p>
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

        {takeaways?.length > 0 && (
          <aside className="article-brief" aria-labelledby="article-brief-title">
            <h2 id="article-brief-title"><span aria-hidden="true">┌─ </span>In this article</h2>
            <ul>{takeaways.map(item => <li key={item}>{item}</li>)}</ul>
          </aside>
        )}
        <div className="article-reading-layout">
          <ArticleContents sections={sections} />
          <ArticleBody html={post.html} />
        </div>

        <nav className="dispatch-after" aria-label="Article navigation">
          <Link to="/blog/">View archive →</Link>
        </nav>
      </article>
    </Layout>
  )
}

export const pageQuery = graphql`
  query EngineeringPostByPath($pathSlug: String!) {
    markdownRemark(frontmatter: { path: { eq: $pathSlug } }) {
      html
      timeToRead
      headings { depth value }
      frontmatter {
        path
        date
        title
        description
        posttype
        snippet
        author
        takeaways
        dispatch
        featuredImage {
          childImageSharp {
            resize(width: 1200, height: 630, fit: CONTAIN, quality: 95) {
              src
              height
              width
            }
          }
        }
      }
    }
  }
`
