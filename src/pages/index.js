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
      <header className="writing-header">
        <h1>Writing</h1>
      </header>

      <CardContainer data={posts} />
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
