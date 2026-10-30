import React from "react"
import { graphql } from "gatsby"
import Layout from "../components/Layout/Layout"
import Seo from "../components/seo"
import CardContainer from "../components/CardContainer/CardContainer"
import "./blog.scss"

const Blog = ({ data }) => {
  const posts = data.allMarkdownRemark.edges

  return (
    <Layout>
      <Seo title="Writing archive" pathname="/blog/" description="All essays by Ted Koomen on software engineering, low-latency systems, Zig, and AI-assisted optimization." />
      <section className="archive-header">
        <p>Writing / archive</p>
        <h1>
          The archive
        </h1>
      </section>
      <CardContainer containerTitle="All Articles" data={posts} />
    </Layout>
  )
}

export const archivePostsQuery = graphql`
  query ArchivePosts {
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      edges {
        node {
          timeToRead
          frontmatter {
            description
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

export default Blog
