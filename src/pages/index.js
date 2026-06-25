import React from "react";
import { graphql, Link } from "gatsby";
import SEO from "../components/seo";
import Layout from "../components/Layout/Layout";
import CardContainer from "../components/CardContainer/CardContainer";
import "./index.scss";

const IndexPage = ({ data }) => {
  const posts = data.allMarkdownRemark.edges;

  return (
    <Layout>
      <SEO title="Screaming Into The Void" />
      <section className="home-masthead">
        <div className="home-masthead__mark" aria-hidden="true" />
        <p className="home-masthead__eyebrow">A technical journal by Ted Koomen</p>
        <h1>Screaming Into The Void</h1>
        <div className="decorative-rule" aria-hidden="true">
          <span className="decorative-rule__dot" />
        </div>
        <p className="home-masthead__dek">
          Articles on software, systems, AI, and the machinery quietly failing
          underneath us.
        </p>
      </section>

      <section className="home-manifesto" aria-label="Publication note">
        <p>
          Articles with a bias toward systems thinking, sharp tradeoffs, and
          fewer polite illusions.
        </p>
        <Link to="/about-me/">About Ted →</Link>
      </section>

      <CardContainer containerTitle="Latest Articles" data={posts} />
    </Layout>
  );
};

export const allPostsQuery = graphql`
  query AllPosts {
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
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
`;

export default IndexPage;
