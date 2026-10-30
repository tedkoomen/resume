const { getArticleSections } = require('../../src/utils/article-sections');
const textOf = node => node.value || (node.children || []).map(textOf).join('');
module.exports = ({ markdownAST }) => {
  const headings = markdownAST.children.filter(node => node.type === 'heading' && node.depth === 2);
  const sections = getArticleSections(headings.map(node => ({ depth: node.depth, value: textOf(node) })));
  headings.forEach((node, index) => {
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: sections[index].id } };
  });
  return markdownAST;
};
