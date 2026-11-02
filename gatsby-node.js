const path = require('path');

exports.createPages = ({ actions, graphql }) => {
  const { createPage } = actions;

  const postTemplate = path.resolve('src/templates/engineeringPost.js');

  return graphql(`
    {
      allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
        edges {
          node {
            frontmatter {
              path
              title
              hideRelatedLinks
            }
          }
        }
      }
    }
  `).then(result => {
    if (result.errors) {
      return Promise.reject(result.errors);
    }

    const posts = result.data.allMarkdownRemark.edges;

    posts.forEach(({ node }, index) => {
      createPage({
        path: node.frontmatter.path,
        component: postTemplate,
        context: {
          pathSlug: node.frontmatter.path,
          issueNumber: posts.length - index,
          // Draft series entries should neither suggest nor be suggested by other articles.
          relatedPosts: node.frontmatter.hideRelatedLinks ? [] : posts.filter(post => !post.node.frontmatter.hideRelatedLinks && post.node.frontmatter.path !== node.frontmatter.path).map(post => post.node.frontmatter),
        },
      });
    });
  });
};

// Keep the canvas-heavy resume in its own document so navigating back to the
// blog tears down every renderer/listener and never loads Three.js in articles.
exports.onPreBootstrap = async () => {
  const { buildResume } = await import('./scripts/build-resume.mjs');
  await buildResume();
};

// Gatsby removes HTML for deleted React pages late in the build. Copy this
// standalone route after that cleanup, including on cached Netlify builds.
exports.onPostBuild = async ({ graphql }) => {
  const fs = require('fs/promises');
  await fs.cp(path.resolve('static/resume'), path.resolve('public/resume'), { recursive: true });
  const result = await graphql(`{ allMarkdownRemark { nodes { frontmatter { path } } } }`);
  if (result.errors) throw new Error('Cannot generate sitemap: ' + JSON.stringify(result.errors));
  const { sitemapXml } = require('./src/utils/seo-data');
  await fs.writeFile(path.resolve('public/sitemap.xml'), sitemapXml(result.data.allMarkdownRemark.nodes.map(node => node.frontmatter.path)));
};
