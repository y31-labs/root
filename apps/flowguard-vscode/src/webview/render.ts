/// <reference lib="dom" />

import {
  itemPolyline,
  type FlowguardGraphViewModel,
  type GraphSourceLink,
  type GraphViewItem,
  type GraphViewItemKey,
} from '#/webview/view-model';

export interface FlowguardGraphRenderHandlers {
  readonly fit: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly search: (query: string) => void;
  readonly select: (key: GraphViewItemKey) => void;
  readonly revealSource: (key: GraphViewItemKey, sourcePath: string) => void;
}

const svgNamespace = 'http://www.w3.org/2000/svg';

export const renderFlowguardGraphWebview = (
  root: HTMLElement,
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): void => {
  const shell = element('section', 'bf-webview');
  shell.append(renderHeader(model, handlers), renderBody(model, handlers));

  root.replaceChildren(shell);
};

const renderHeader = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const header = element('header', 'bf-header');
  const titleGroup = element('div', 'bf-title');
  const title = element('h1');
  title.textContent = model.document?.title ?? 'Flowguard';
  titleGroup.append(title);

  if (model.document !== undefined) {
    const meta = element('p', 'bf-meta');
    meta.textContent =
      model.document.proposal === undefined
        ? `${model.document.rootName} / ${model.document.relativePath}`
        : `${model.document.rootName} / ${model.document.relativePath} with proposal ${model.document.proposal.proposalId}`;
    titleGroup.append(meta);
  }

  const toolbar = element('div', 'bf-toolbar');
  toolbar.append(
    toolbarButton('Fit graph', 'Fit', handlers.fit),
    toolbarButton('Zoom out', '-', handlers.zoomOut),
    toolbarButton('Zoom in', '+', handlers.zoomIn),
  );

  const searchLabel = element('label', 'bf-search');
  const searchText = element('span', 'bf-sr-only');
  searchText.textContent = 'Search graph items';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search';
  searchInput.value = model.search.query;
  searchInput.addEventListener('input', () => {
    handlers.search(searchInput.value);
  });
  searchLabel.append(searchText, searchInput);
  toolbar.append(searchLabel);

  header.append(titleGroup, toolbar);
  return header;
};

const renderBody = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const body = element('div', 'bf-body');

  if (model.hostError !== undefined) {
    const error = element('p', 'bf-banner bf-banner-error');
    error.textContent = model.hostError;
    body.append(error);
  }

  if (model.emptyMessage !== undefined) {
    const empty = element('p', 'bf-empty');
    empty.textContent = model.emptyMessage;
    body.append(empty);
    return body;
  }

  if (model.document !== undefined && model.document.warnings.length > 0) {
    for (const warning of model.document.warnings) {
      const warningElement = element('p', 'bf-banner bf-banner-warning');
      warningElement.textContent = warning;
      body.append(warningElement);
    }
  }

  if (model.document?.proposal !== undefined) {
    const proposal = element('p', 'bf-proposal');
    proposal.textContent = `${model.document.proposal.summary} Confidence: ${model.document.proposal.confidence}.`;
    body.append(proposal);
  }

  if (model.globalIssues.length > 0) {
    const issues = element('ul', 'bf-banner bf-global-issues');
    for (const issue of model.globalIssues) {
      const item = element('li');
      item.textContent = `${issue.severity}: ${issue.message}`;
      issues.append(item);
    }
    body.append(issues);
  }

  const layout = element('div', 'bf-main');
  layout.append(renderGraphCanvas(model, handlers), renderSidePanel(model, handlers));
  body.append(layout);
  return body;
};

const renderGraphCanvas = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const panel = element('section', 'bf-graph-panel');
  panel.setAttribute('aria-label', 'Flowguard graph');
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', 'bf-graph');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', model.document?.title ?? 'Flowguard graph');
  svg.setAttribute('viewBox', model.layout?.viewBox ?? '0 0 100 100');

  const defs = document.createElementNS(svgNamespace, 'defs');
  const marker = document.createElementNS(svgNamespace, 'marker');
  marker.setAttribute('id', 'bf-arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const markerPath = document.createElementNS(svgNamespace, 'path');
  markerPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  marker.append(markerPath);
  defs.append(marker);
  svg.append(defs);

  for (const edge of model.edges) {
    svg.append(renderEdge(edge, model.selectedItem?.key === edge.key, handlers));
  }

  for (const node of model.nodes) {
    svg.append(renderNode(node, model.selectedItem?.key === node.key, handlers));
  }

  panel.append(svg);
  return panel;
};

const renderEdge = (
  edge: GraphViewItem & { readonly itemKind: 'edge' },
  selected: boolean,
  handlers: FlowguardGraphRenderHandlers,
): SVGElement => {
  const group = document.createElementNS(svgNamespace, 'g');
  group.setAttribute('class', itemClass('bf-edge', edge, selected));
  group.setAttribute('role', 'button');
  group.setAttribute('tabindex', '0');
  group.setAttribute('aria-label', edge.ariaLabel);
  group.addEventListener('click', () => handlers.select(edge.key));
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlers.select(edge.key);
    }
  });

  const polyline = document.createElementNS(svgNamespace, 'polyline');
  polyline.setAttribute('class', `bf-edge-path ${edge.statusPresentation.lineClassName}`);
  polyline.setAttribute('points', itemPolyline(edge.layout.points));
  polyline.setAttribute('marker-end', 'url(#bf-arrow)');

  const label = document.createElementNS(svgNamespace, 'text');
  label.setAttribute('class', 'bf-edge-label');
  label.setAttribute('x', String(edge.layout.labelPoint.x));
  label.setAttribute('y', String(edge.layout.labelPoint.y - 8));
  label.textContent = `${edge.statusPresentation.marker} ${edge.displayLabel}`;

  group.append(polyline, label);
  return group;
};

const renderNode = (
  node: GraphViewItem & { readonly itemKind: 'node' },
  selected: boolean,
  handlers: FlowguardGraphRenderHandlers,
): SVGElement => {
  const group = document.createElementNS(svgNamespace, 'g');
  group.setAttribute('class', itemClass('bf-node', node, selected));
  group.setAttribute('role', 'button');
  group.setAttribute('tabindex', '0');
  group.setAttribute('aria-label', node.ariaLabel);
  group.setAttribute('transform', `translate(${node.layout.x} ${node.layout.y})`);
  group.addEventListener('click', () => handlers.select(node.key));
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlers.select(node.key);
    }
  });

  const rect = document.createElementNS(svgNamespace, 'rect');
  rect.setAttribute('class', 'bf-node-shape');
  rect.setAttribute('width', String(node.layout.width));
  rect.setAttribute('height', String(node.layout.height));
  rect.setAttribute('rx', node.nodeKind === 'terminal' ? '2' : '6');

  const title = document.createElementNS(svgNamespace, 'text');
  title.setAttribute('class', 'bf-node-title');
  title.setAttribute('x', '14');
  title.setAttribute('y', '28');
  title.textContent = `${node.statusPresentation.marker} ${node.label}`;

  const kind = document.createElementNS(svgNamespace, 'text');
  kind.setAttribute('class', 'bf-node-meta');
  kind.setAttribute('x', '14');
  kind.setAttribute('y', '52');
  kind.textContent = node.route === undefined ? node.nodeKind : `${node.nodeKind} ${node.route}`;

  const id = document.createElementNS(svgNamespace, 'text');
  id.setAttribute('class', 'bf-node-id');
  id.setAttribute('x', '14');
  id.setAttribute('y', '76');
  id.textContent = node.semanticId;

  group.append(rect, title, kind, id);
  return group;
};

const renderSidePanel = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const side = element('aside', 'bf-side');
  side.append(renderList(model, handlers), renderInspector(model, handlers));
  return side;
};

const renderList = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const section = element('section', 'bf-list-section');
  const heading = element('h2');
  heading.textContent =
    model.search.query.length === 0
      ? 'Items'
      : `Items: ${model.search.matchCount} search match${model.search.matchCount === 1 ? '' : 'es'}`;
  const list = element('ul', 'bf-item-list');

  for (const item of model.listItems) {
    const row = element('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
      'bf-list-item',
      item.selected ? 'is-selected' : '',
      item.matchesSearch ? 'is-match' : '',
    ]
      .filter(Boolean)
      .join(' ');
    button.setAttribute('aria-pressed', String(item.selected));
    button.addEventListener('click', () => handlers.select(item.key));

    const title = element('span', 'bf-list-title');
    title.textContent = `${item.statusMarker} ${item.label}`;
    const meta = element('span', 'bf-list-meta');
    meta.textContent = `${item.kindLabel} / ${item.statusLabel}`;
    const summary = element('span', 'bf-sr-only');
    summary.textContent = item.summary;
    button.append(title, meta, summary);
    row.append(button);
    list.append(row);
  }

  section.append(heading, list);
  return section;
};

const renderInspector = (
  model: FlowguardGraphViewModel,
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const section = element('section', 'bf-inspector');
  const heading = element('h2');
  heading.textContent = 'Inspector';
  section.append(heading);

  if (model.inspector === undefined || model.selectedItem === undefined) {
    const empty = element('p', 'bf-empty');
    empty.textContent = 'Select a state or transition.';
    section.append(empty);
    return section;
  }

  const selectedKey = model.selectedItem.key;
  const title = element('h3');
  title.textContent = model.inspector.heading;
  section.append(title, renderDefinitionList(model.inspector.fields));

  if (model.inspector.sourceLinks.length > 0) {
    section.append(renderSources(selectedKey, model.inspector.sourceLinks, handlers));
  }

  if (model.inspector.issues.length > 0) {
    const issues = element('ul', 'bf-issues');
    for (const issue of model.inspector.issues) {
      const item = element('li');
      item.textContent = `${issue.severity}: ${issue.message}`;
      issues.append(item);
    }
    section.append(issues);
  }

  return section;
};

const renderDefinitionList = (
  fields: readonly { readonly label: string; readonly value: string }[],
): HTMLElement => {
  const list = element('dl', 'bf-details');
  for (const field of fields) {
    const term = element('dt');
    term.textContent = field.label;
    const description = element('dd');
    description.textContent = field.value;
    list.append(term, description);
  }
  return list;
};

const renderSources = (
  selectedKey: GraphViewItemKey,
  sourceLinks: readonly GraphSourceLink[],
  handlers: FlowguardGraphRenderHandlers,
): HTMLElement => {
  const section = element('section', 'bf-sources');
  const heading = element('h3');
  heading.textContent = 'Sources';
  const list = element('ul');

  for (const source of sourceLinks) {
    const row = element('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bf-source-link';
    button.textContent = source.sourcePath;
    button.addEventListener('click', () => {
      handlers.revealSource(selectedKey, source.sourcePath);
    });
    row.append(button);
    list.append(row);
  }

  section.append(heading, list);
  return section;
};

const toolbarButton = (label: string, text: string, onClick: () => void): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
};

const itemClass = (prefix: string, item: GraphViewItem, selected: boolean): string => {
  return [
    prefix,
    item.statusPresentation.className,
    item.statusPresentation.isDimmed ? 'is-dimmed' : '',
    item.validationTreatment === 'invalid' ? 'bf-status-invalid' : '',
    item.validationTreatment === 'warning' ? 'bf-status-warning' : '',
    item.matchesSearch ? 'is-match' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tagName);
  if (className !== undefined) node.className = className;
  return node;
};
