// Shared hover tooltip for the historical and real-time Sankey diagrams.
// Content is built with textContent, so node names from user data are never
// interpreted as HTML.

interface FlowLink {
  source: string;
  target: string;
  value: number;
}

type Row = [label: string, value: string];

export const formatFlowValue = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatPercent = (part: number, total: number): string =>
  total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";

export const nodeTooltipRows = (name: string, links: FlowLink[]): Row[] => {
  const inflow = links
    .filter((l) => l.target === name)
    .reduce((sum, l) => sum + l.value, 0);
  const outflow = links
    .filter((l) => l.source === name)
    .reduce((sum, l) => sum + l.value, 0);

  const rows: Row[] = [];
  if (inflow > 0) rows.push(["In", formatFlowValue(inflow)]);
  if (outflow > 0) rows.push(["Out", formatFlowValue(outflow)]);
  return rows;
};

export const linkTooltipRows = (link: FlowLink, links: FlowLink[]): Row[] => {
  const sourceOutflow = links
    .filter((l) => l.source === link.source)
    .reduce((sum, l) => sum + l.value, 0);

  return [
    ["Value", formatFlowValue(link.value)],
    [`Share of ${link.source}`, formatPercent(link.value, sourceOutflow)],
  ];
};

export interface SankeyTooltip {
  show: (event: MouseEvent, title: string, rows: Row[]) => void;
  move: (event: MouseEvent) => void;
  hide: () => void;
}

/**
 * Create (or reuse) the tooltip element inside `container`, which must be
 * positioned (the diagram containers use `position: relative`).
 */
export const createSankeyTooltip = (container: HTMLElement): SankeyTooltip => {
  let el = container.querySelector<HTMLDivElement>(":scope > .sankey-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.className = "sankey-tooltip";
    el.setAttribute("role", "tooltip");
    container.appendChild(el);
  }
  const tooltip = el;
  // The diagram is redrawn from scratch, so any element being hovered is gone.
  tooltip.hidden = true;

  const move = (event: MouseEvent) => {
    const bounds = container.getBoundingClientRect();
    const offset = 14;
    let left = event.clientX - bounds.left + offset;
    let top = event.clientY - bounds.top + offset;

    // Flip to the other side of the cursor when it would overflow the container
    if (left + tooltip.offsetWidth > bounds.width) {
      left = event.clientX - bounds.left - tooltip.offsetWidth - offset;
    }
    if (top + tooltip.offsetHeight > bounds.height) {
      top = event.clientY - bounds.top - tooltip.offsetHeight - offset;
    }

    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${Math.max(0, top)}px`;
  };

  const show = (event: MouseEvent, title: string, rows: Row[]) => {
    const heading = document.createElement("div");
    heading.className = "sankey-tooltip-title";
    heading.textContent = title;

    const list = document.createElement("dl");
    for (const [label, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      list.append(dt, dd);
    }

    tooltip.replaceChildren(heading, list);
    tooltip.hidden = false;
    move(event);
  };

  const hide = () => {
    tooltip.hidden = true;
  };

  return { show, move, hide };
};

interface SankeyHoverOptions {
  container: HTMLElement;
  /** Flow links, index-aligned with `linkElements` */
  links: FlowLink[];
  linkElements: SVGElement[];
  /** Node names, index-aligned with `nodeElements` */
  nodeNames: string[];
  nodeElements: SVGElement[];
}

/**
 * Show tooltips for nodes and links, and highlight a node's connected links
 * while it is hovered.
 */
export const attachSankeyHover = ({
  container,
  links,
  linkElements,
  nodeNames,
  nodeElements,
}: SankeyHoverOptions) => {
  const tooltip = createSankeyTooltip(container);

  // Classes go on the link's group so its value label is dimmed too
  // (styles in SankeyDiagram.css)
  const highlightNode = (name: string | null) => {
    linkElements.forEach((el, i) => {
      const link = links[i];
      const group = el.parentElement ?? el;
      const connected =
        name !== null && (link.source === name || link.target === name);
      group.classList.toggle("link-connected", connected);
      group.classList.toggle("link-dimmed", name !== null && !connected);
    });
  };

  linkElements.forEach((el, i) => {
    const link = links[i];
    if (!link) return;
    el.addEventListener("mouseenter", (event) =>
      tooltip.show(
        event,
        `${link.source} → ${link.target}`,
        linkTooltipRows(link, links)
      )
    );
    el.addEventListener("mousemove", tooltip.move);
    el.addEventListener("mouseleave", tooltip.hide);
  });

  nodeElements.forEach((el, i) => {
    const name = nodeNames[i];
    el.addEventListener("mouseenter", (event) => {
      tooltip.show(event, name, nodeTooltipRows(name, links));
      highlightNode(name);
    });
    el.addEventListener("mousemove", tooltip.move);
    el.addEventListener("mouseleave", () => {
      tooltip.hide();
      highlightNode(null);
    });
    // Get out of the way while a node is being dragged
    el.addEventListener("mousedown", tooltip.hide);
  });
};
