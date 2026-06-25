import React from "react";
import { graphql, Link } from "gatsby";
import Img from "gatsby-image";
import Layout from "../components/Layout/Layout";
import Seo from "../components/seo";
import "./about-me.scss";

const AboutMePage = ({ data, path }) => {
  return (
    <Layout path={path}>
      <Seo title="About" />
      <section className="about-page">
        <div className="about-page__image">
          <Img fluid={data.file.childImageSharp.fluid} alt="Ted Koomen" />
        </div>
        <div className="about-page__copy">
          <p className="about-page__kicker">About</p>
          <h1>Ted Koomen</h1>
          <p className="about-page__lede">
            I build software systems and write articles about engineering,
            performance, AI, and the places where elegant abstractions stop
            helping.
          </p>
          <p>
            My work has focused on scalable backend services, API design, stream
            processing, and asynchronous mechanisms. I am most interested in
            engineering that survives contact with production constraints.
          </p>
          <p>
            Screaming Into The Void is where I publish long-form notes on
            software, systems, and the industry habits worth questioning.
          </p>
          <div className="about-page__links">
            <Link to="/resume/">Resume →</Link>
            <a href="https://github.com/tedkoomen" rel="noreferrer" target="_blank">
              GitHub →
            </a>
            <a href="https://www.linkedin.com/in/tedkoomen/" rel="noreferrer" target="_blank">
              LinkedIn →
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export const data = graphql`
  query AboutMeImageQuery {
    file(relativePath: { eq: "professional.jpg" }) {
      childImageSharp {
        fluid(quality: 100) {
          ...GatsbyImageSharpFluid
        }
      }
    }
  }
`;

export default AboutMePage;
