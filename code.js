figma.showUI(__html__, { width: 320, height: 520 });

function findAllComponents(node, results = []) {
  if (node.type === 'COMPONENT') {
    results.push({ id: node.id, name: node.name });
  }
  if ('children' in node) {
    for (const child of node.children) {
      findAllComponents(child, results);
    }
  }
  return results;
}

function scanForInstances(node, nameSet, hits) {
  if (node.type === 'INSTANCE') {
    const main = node.mainComponent;
    if (main && nameSet.has(main.name)) {
      hits.push({ node, compName: main.name });
    }
  }
  if ('children' in node) {
    for (const child of node.children) {
      scanForInstances(child, nameSet, hits);
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'run') {
    const page = figma.root.children.find(p => p.name === 'Components');
    if (!page) {
      figma.ui.postMessage({ type: 'error', message: 'Страница "Components" не найдена' });
      return;
    }
    const components = findAllComponents(page);
    figma.ui.postMessage({ type: 'components', components });
  }

  if (msg.type === 'find') {
    const currentPage = figma.currentPage;
    const nameSet = new Set(msg.componentNames);

    // { frameName: { compName: count } }
    const summary = {};

    for (const topFrame of currentPage.children) {
      if (topFrame.type !== 'FRAME') continue;

      const hits = [];
      scanForInstances(topFrame, nameSet, hits);
      if (hits.length === 0) continue;

      summary[topFrame.name] = {};

      for (const { node, compName } of hits) {
        // подсвечиваем сам инстанс
        node.fills = [
          ...node.fills,
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.2 }
        ];

        summary[topFrame.name][compName] = (summary[topFrame.name][compName] || 0) + 1;
      }
    }

    figma.ui.postMessage({ type: 'find-result', summary });
  }
};
