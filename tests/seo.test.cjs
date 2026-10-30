const { test } = require('node:test')
const assert = require('node:assert/strict')
const { structuredData, sitemapXml } = require('../src/utils/seo-data')

test('article graph connects author, canonical, image, and actual publication date', () => {
  const data = structuredData({ title: 'A < B', description: 'An essay', pathname: '/blog/engineering/example/', image: 'https://www.tedkoomen.com/social/example.png', article: true, datePublished: '2026-06-29' })
  const article = data['@graph'].find(node => node['@type'] === 'BlogPosting')
  const person = data['@graph'].find(node => node['@type'] === 'Person')
  assert.equal(article.author['@id'], person['@id'])
  assert.equal(article.mainEntityOfPage, 'https://www.tedkoomen.com/blog/engineering/example/')
  assert.equal(article.datePublished, '2026-06-29T00:00:00.000Z')
  assert.equal(article.dateModified, undefined)
  assert.equal(article.image[0], 'https://www.tedkoomen.com/social/example.png')
})

test('sitemap includes standalone resume and every article once, with XML escaping', () => {
  const xml = sitemapXml(['/blog/engineering/example', '/blog/engineering/example', '/a?x=1&y=2'])
  assert.ok(xml.includes('<loc>https://www.tedkoomen.com/resume/</loc>'))
  assert.equal(xml.match(/engineering\/example/g).length, 1)
  assert.ok(xml.includes('x=1&amp;y=2'))
  assert.ok(!xml.includes('404'))
})
