import React from "react"
import PropTypes from "prop-types"
import { Helmet } from "react-helmet"
import { useStaticQuery, graphql } from "gatsby"

function SEO({ description, lang, meta, image, title, pathname, article }) {
  const { site } = useStaticQuery(graphql`
    query {
      site {
        siteMetadata {
          title
          description
          author
          keywords
          siteUrl
          twitterUsername
        }
      }
    }
  `)
  const metadata = site.siteMetadata
  const metaDescription = description || metadata.description
  const socialImage = image || {
    src: "/social/site.png",
    width: 1200,
    height: 630,
  }
  const imageUrl = new URL(socialImage.src, metadata.siteUrl).href
  const canonical = pathname ? new URL(pathname, metadata.siteUrl).href : null
  const imageAlt = `${title} — ${metadata.author}, ${metadata.title}`
  return (
    <Helmet
      htmlAttributes={{ lang }}
      title={title}
      titleTemplate={`%s | ${metadata.title}`}
      link={canonical ? [{ rel: "canonical", href: canonical }] : []}
      meta={[
        { name: "description", content: metaDescription },
        { name: "keywords", content: metadata.keywords.join(",") },
        { property: "og:title", content: title },
        { property: "og:description", content: metaDescription },
        { property: "og:type", content: article ? "article" : "website" },
        ...(canonical ? [{ property: "og:url", content: canonical }] : []),
        { property: "og:site_name", content: metadata.title },
        { property: "og:image", content: imageUrl },
        { property: "og:image:width", content: socialImage.width },
        { property: "og:image:height", content: socialImage.height },
        { property: "og:image:alt", content: imageAlt },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:creator", content: metadata.twitterUsername },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: metaDescription },
        { name: "twitter:image", content: imageUrl },
        { name: "twitter:image:alt", content: imageAlt },
      ].concat(meta)}
    />
  )
}
SEO.defaultProps = { lang: "en", meta: [], description: "", article: false }
SEO.propTypes = {
  description: PropTypes.string,
  lang: PropTypes.string,
  meta: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string.isRequired,
  image: PropTypes.shape({
    src: PropTypes.string.isRequired,
    height: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
  }),
  pathname: PropTypes.string,
  article: PropTypes.bool,
}
export default SEO
