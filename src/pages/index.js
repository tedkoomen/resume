import React from "react"
import { graphql } from "gatsby"
import SEO from "../components/seo"
import Layout from "../components/Layout/Layout"
import CardContainer from "../components/CardContainer/CardContainer"
import "./index.scss"

const IndexPage = ({ data }) => {
  const posts = data.allMarkdownRemark.edges

  return (
    <Layout>
      <SEO title="Critical Section — Ted Koomen" pathname="/" />
      <section className="home-masthead">
        <p className="home-masthead__eyebrow">An engineering journal</p>
        <h1>
          Below the abstraction.
        </h1>
        <p className="home-masthead__dek">
          Essays on performance, concurrency, and the tradeoffs that show up
          in production.
        </p>
      </section>

      <CardContainer containerTitle="Writing" data={posts} />
    </Layout>
  )
}

export const allPostsQuery = graphql`
  query AllPosts {
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      edges {
        node {
          timeToRead
          frontmatter {
            author
            description
            featured
            path
            posttype
            title
            date
            dispatch
          }
        }
      }
    }
  }
`

export default IndexPage
