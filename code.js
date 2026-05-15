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
      figma.ui.postMessage({ type: 'error', message: 'Page "Components" not found' });
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

  if (msg.type === 'wrap-in-section') {
    const sel = figma.currentPage.selection;
    if (sel.length === 0) {
      figma.notify('Select nodes to wrap');
      return;
    }

    // Найти ноду "Template Section" на текущей странице
    const template = figma.currentPage.findOne(n => n.name === 'Template Section');
    if (!template) {
      figma.notify('"Template Section" node not found on current page');
      return;
    }

    // Запомнить позицию первой ноды до перемещения
    let minX = Infinity, minY = Infinity;
    for (const node of sel) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    }

    // Клонировать шаблон и сразу поставить на место
    const section = template.clone();
    section.name = 'Section';
    section.x = minX;
    section.y = minY;

    // Переместить ноды внутрь секции с абсолютным позиционированием
    if (section.type === 'FRAME') {
      section.layoutMode = 'NONE';
    }

    for (const node of sel) {
      const absX = node.absoluteBoundingBox.x;
      const absY = node.absoluteBoundingBox.y;
      section.appendChild(node);
      node.x = absX - section.x;
      node.y = absY - section.y;
    }

    // Считаем bounding box детей внутри секции
    const PAD = 64;
    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    for (const child of section.children) {
      cMinX = Math.min(cMinX, child.x);
      cMinY = Math.min(cMinY, child.y);
      cMaxX = Math.max(cMaxX, child.x + child.width);
      cMaxY = Math.max(cMaxY, child.y + child.height);
    }

    // Сдвигаем детей чтобы паддинг был сверху и слева
    for (const child of section.children) {
      child.x = child.x - cMinX + PAD;
      child.y = child.y - cMinY + PAD;
    }

    // Ресайз секции под контент + паддинги
    const contentW = cMaxX - cMinX;
    const contentH = cMaxY - cMinY;
    const EXTRA = 600;
    const totalW = contentW + PAD * 2 + EXTRA;
    const totalH = contentH + PAD * 2 + EXTRA;
    section.resizeWithoutConstraints(totalW, totalH);

    // Сдвигаем секцию так чтобы контент оказался по центру
    section.x -= EXTRA / 2;
    section.y -= EXTRA / 2;

    // Компенсируем сдвиг для детей
    for (const child of section.children) {
      child.x += EXTRA / 2;
      child.y += EXTRA / 2;
    }

    figma.currentPage.selection = [section];
    figma.viewport.scrollAndZoomIntoView([section]);
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
