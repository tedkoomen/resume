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
      <SEO title="Screaming Into The Void" pathname="/" />
      <section className="home-masthead">
        <p className="home-masthead__eyebrow">Ted Koomen / Engineering notes</p>
        <h1>
          Screaming
          <br />
          into the void
          <span className="home-masthead__cursor" aria-hidden="true" />
        </h1>
        <p className="home-masthead__dek">
          Software, systems, and the cost of getting it wrong. Notes from below
          the abstraction.
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
