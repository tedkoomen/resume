const test = require("node:test")
const assert = require("node:assert/strict")
const { createPages } = require("../gatsby-node")

test("draft entries neither display related links nor appear in other articles' suggestions", async () => {
  const posts = [
    { path: "/published-a", title: "A" },
    { path: "/draft", title: "Draft", hideRelatedLinks: true },
    { path: "/published-b", title: "B" },
  ]
  const pages = []
  await createPages({ actions: { createPage: page => pages.push(page) },
    graphql: async () => ({ data: { allMarkdownRemark: { edges: posts.map(frontmatter => ({ node: { frontmatter } })) } } }) })
  assert.deepEqual(pages.find(p => p.path === "/draft").context.relatedPosts, [])
  assert.deepEqual(pages.find(p => p.path === "/published-a").context.relatedPosts.map(p => p.path), ["/published-b"])
  assert.deepEqual(pages.find(p => p.path === "/published-b").context.relatedPosts.map(p => p.path), ["/published-a"])
})
