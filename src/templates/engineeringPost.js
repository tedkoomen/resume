import React from "react";
import { graphql } from "gatsby";
import Layout from "../components/Layout/Layout";
import Hero from '../components/Hero/Hero';
import Seo from '../components/seo';
import moment from 'moment';
import Img from 'gatsby-image';
import './engineeringPost.scss'
import "bootstrap/dist/css/bootstrap.min.css";


export default ({ data, location }) => {
  if (!data?.markdownRemark) {
    return null;
  }

  const {
    date,
    title,
    description,
    posttype,
    featured,
    snippet,
    image,
    featuredImage,
    author,
  } = data.markdownRemark.frontmatter;

  const post = data.markdownRemark;
  const seoImage = featuredImage?.childImageSharp?.resize;

  return (
    <Layout navWhite>
      { console.log(seoImage) }
      <Seo
        title={title}
        description={description}
        pathname={location.pathname}
        image={seoImage}
      />
      <Hero background="#FFF">
        <div className="container">
          <div style={{
            marginTop: "10%",
            marginBottom: "10%"
          }}>
              <div className={`post-type post-type-${posttype}`}>
                {posttype}
              </div>
              <p style={{fontWeight: "bold", fontSize: "32px"}}>{description}</p>     
              <div style={{maxWidth: "550px"}}>
                <p style={{fontSize: '16px', fontWeight: "300"}}>{snippet}</p>
              </div>
              <div className="post-date">{moment(date).format('MMMM DD, YYYY')}</div>
              <div className="post-date">{author}</div>
              <a href="https://twitter.com/Ted_Koomen?ref_src=twsrc%5Etfw" class="twitter-follow-button" data-show-count="false">Follow @Ted_Koomen</a><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
          </div>
        </div>
      </Hero>
      <Img fluid={image.childImageSharp.fluid} style={{maxHeight: "500px", marginBottom: "50px", minHeight: '500px'}} />
      <div className="container">
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </div>
    </Layout>
  );
};

export const pageQuery = graphql`
  query EngineeringPostByPath($pathSlug: String!) {
    markdownRemark(frontmatter: { path: { eq: $pathSlug } }) {
      html
      frontmatter {
        path
        date
        title
        description
        posttype
        featured
        snippet
        author
        image {
          childImageSharp {
            fluid(maxWidth: 1400, quality: 90) {
              ...GatsbyImageSharpFluid
            }
          }
        }
        featuredImage {
          childImageSharp {
            resize(width: 1200) {
              src
            }
          }
        }
      }
    }
  }
`;
