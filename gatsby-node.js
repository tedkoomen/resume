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
exports.onPostBuild = async () => {
  const fs = require('fs/promises');
  await fs.cp(path.resolve('static/resume'), path.resolve('public/resume'), { recursive: true });
};
