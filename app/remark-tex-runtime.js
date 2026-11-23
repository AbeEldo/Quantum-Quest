/**
 * remark plugin: replace math nodes (from remark-math) with <Tex tex="…"/> JSX
 * elements so KaTeX renders at runtime from the TeX source. This keeps the
 * bundle small (pre-rendered KaTeX HTML is ~50x larger than the TeX itself).
 */
export default function remarkTexRuntime() {
  return (tree) => {
    const visit = (node) => {
      if (!node.children) return;
      node.children = node.children.map((ch) => {
        if (ch.type === 'inlineMath' || ch.type === 'math') {
          const display = ch.type === 'math';
          return {
            type: display ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
            name: 'Tex',
            attributes: [
              { type: 'mdxJsxAttribute', name: 'tex', value: ch.value },
              ...(display ? [{ type: 'mdxJsxAttribute', name: 'display', value: null }] : []),
            ],
            children: [],
          };
        }
        visit(ch);
        return ch;
      });
    };
    visit(tree);
  };
}
