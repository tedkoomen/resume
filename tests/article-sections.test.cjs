const test = require('node:test');
const assert = require('node:assert/strict');
const { getArticleSections, responsiveDiagram } = require('../src/utils/article-sections');
const readingSections = require('../plugins/gatsby-remark-reading-sections');

test('section links remain unique with punctuation, accents, and repeated headings', () => {
  assert.deepEqual(getArticleSections([
    { depth: 1, value: 'Title' }, { depth: 2, value: 'Café & C++?' },
    { depth: 3, value: 'Detail' }, { depth: 2, value: 'Café & C++?' },
  ]), [{ title: 'Café & C++?', id: 'cafe-c' }, { title: 'Café & C++?', id: 'cafe-c-2' }]);
});

test('generated heading anchors match contents links, including inline code', () => {
  const heading = {type: 'heading', depth: 2, children: [
    {type: 'text', value: 'Why '}, {type: 'inlineCode', value: 'std::map'},
  ]};
  const markdownAST = { children: [heading] };
  readingSections({markdownAST});
  assert.equal(heading.data.hProperties.id, getArticleSections([{depth: 2, value: 'Why std::map'}])[0].id);
});

test('mobile flowcharts become vertical without changing sequence diagrams or node labels', () => {
  const flow = 'graph LR\n A[LR] --> B[end]';
  assert.equal(responsiveDiagram(flow, true), 'graph TB\n A[LR] --> B[end]');
  assert.equal(responsiveDiagram(flow, false), flow);
  const sequence = 'sequenceDiagram\n A->>B: graph LR';
  assert.equal(responsiveDiagram(sequence, true), sequence);
});
