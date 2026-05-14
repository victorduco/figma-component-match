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

function scanForFrames(node, nameSet, hits) {
  if (node.type === 'FRAME' && nameSet.has(node.name)) {
    hits.push({ node, compName: node.name });
    return;
  }
  if ('children' in node) {
    for (const child of node.children) {
      scanForFrames(child, nameSet, hits);
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

    const summary = {};

    for (const topFrame of currentPage.children) {
      if (topFrame.type !== 'FRAME') continue;

      const hits = [];
      scanForFrames(topFrame, nameSet, hits);
      if (hits.length === 0) continue;

      summary[topFrame.name] = {};

      for (const { node, compName } of hits) {
        node.fills = [
          ...node.fills,
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.2 }
        ];
        summary[topFrame.name][compName] = (summary[topFrame.name][compName] || 0) + 1;
      }
    }

    figma.ui.postMessage({ type: 'find-result', summary });
  }

  if (msg.type === 'replace') {
    const currentPage = figma.currentPage;
    // nameToId: { compName -> componentId } — передаём из UI
    const nameToId = msg.nameToId;
    const nameSet = new Set(Object.keys(nameToId));
    let replaced = 0;

    for (const topFrame of currentPage.children) {
      if (topFrame.type !== 'FRAME') continue;

      const hits = [];
      scanForFrames(topFrame, nameSet, hits);

      for (const { node, compName } of hits) {
        const component = figma.getNodeById(nameToId[compName]);
        if (!component || component.type !== 'COMPONENT') continue;

        const instance = component.createInstance();
        instance.x = node.x;
        instance.y = node.y;
        instance.resize(node.width, node.height);

        node.parent.insertChild(node.parent.children.indexOf(node), instance);
        node.remove();
        replaced++;
      }
    }

    figma.ui.postMessage({ type: 'replace-result', replaced });
  }
};
