import React from "react";
import { graphql } from "gatsby";
import Layout from "../components/Layout/Layout";
import Seo from "../components/seo";
import CardContainer from "../components/CardContainer/CardContainer";
import "./blog.scss";

const Blog = ({ data }) => {
  const posts = data.allMarkdownRemark.edges;

  return (
    <Layout>
      <Seo title="Archive" />
      <section className="archive-header">
        <p>Archive</p>
        <h1>Every article, in reverse chronological order.</h1>
      </section>
      <CardContainer containerTitle="All Articles" data={posts} />
    </Layout>
  );
};

export const archivePostsQuery = graphql`
  query ArchivePosts {
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
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
`;

export default Blog;
