function getArticleSections(headings) {
  const used = new Set();
  return headings.filter(heading => heading.depth === 2).map(heading => {
    const base = heading.value.toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    let id = base, suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return { title: heading.value, id };
  });
}
function responsiveDiagram(source, narrow) {
  return narrow ? source.replace(/^(\s*)(graph|flowchart)\s+(LR|RL)\b/m, '$1$2 TB') : source;
}
module.exports = { getArticleSections, responsiveDiagram };
