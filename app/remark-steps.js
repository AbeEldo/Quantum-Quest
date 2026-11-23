/**
 * remark plugin: split an MDX lesson at thematic breaks (---) into
 * <Step index="i" total="n"> … </Step> blocks so the lesson player can
 * reveal them one at a time. ESM import/export nodes stay at the root.
 */
export default function remarkSteps() {
  return (tree) => {
    const esm = [];
    const groups = [[]];
    for (const node of tree.children) {
      if (node.type === 'mdxjsEsm') esm.push(node);
      else if (node.type === 'thematicBreak') groups.push([]);
      else groups[groups.length - 1].push(node);
    }
    const nonEmpty = groups.filter((g) => g.length > 0);
    const total = String(nonEmpty.length);
    tree.children = [
      ...esm,
      ...nonEmpty.map((children, i) => ({
        type: 'mdxJsxFlowElement',
        name: 'Step',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'index', value: String(i) },
          { type: 'mdxJsxAttribute', name: 'total', value: total },
        ],
        children,
      })),
    ];
  };
}
