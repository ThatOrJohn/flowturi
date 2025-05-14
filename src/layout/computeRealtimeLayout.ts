import * as d3 from "d3";
import { LayoutState, FrameData } from "./computeLayout";

// Sliding window for smoothing transitions
interface SmoothingCache {
  nodePositions: Map<
    string,
    {
      y: number;
      height: number;
      yIndex: number; // For maintaining vertical order
      lastSeen: number; // Tick/frame number when this node was last seen
    }
  >;
  linkValues: Map<string, number>; // key format: "sourceId->targetId"
  lastTick: number;
}

/**
 * Compute layout for real-time streamed Sankey data
 * Following the philosophy from sankey-layout-strategy.md:
 * - Fixed node Y order
 * - Sliding window smoothing
 * - Minimize reshuffling
 */
export function computeRealtimeLayout(
  newFrame: FrameData,
  previousState: LayoutState | null,
  smoothingCache: SmoothingCache | null = null,
  width = 800,
  height = 600
): { layoutState: LayoutState; smoothingCache: SmoothingCache } {
  console.log("Computing Sankey layout for real-time data...");
  console.log("Frame data:", {
    timestamp: newFrame.timestamp,
    tick: newFrame.tick,
    nodes: newFrame.nodes.length,
    links: newFrame.links.length,
    nodeNames: newFrame.nodes.map((n) => n.name),
    linkPairs: newFrame.links.map((l) => `${l.source}->${l.target}`),
  });

  // Initialize or use existing smoothing cache
  const cache: SmoothingCache = smoothingCache || {
    nodePositions: new Map(),
    linkValues: new Map(),
    lastTick: 0,
  };

  // Extract tick number from timestamp if available
  const currentTick =
    newFrame.tick || new Date(newFrame.timestamp).getTime() / 1000;

  // Normalize node data to handle both 'id' and 'name' properties
  const normalizedNodes = newFrame.nodes.map((node) => ({
    name: (node as any).id || node.name, // Handle both id and name properties
  }));

  // Verify all nodes have names
  const nodeNames = normalizedNodes.map((n) => n.name);
  if (nodeNames.some((name) => !name)) {
    console.error("Some nodes are missing names:", newFrame.nodes);
  }

  // Verify links reference valid nodes
  const validLinks = newFrame.links.filter((link) => {
    const sourceExists = nodeNames.includes(link.source);
    const targetExists = nodeNames.includes(link.target);
    if (!sourceExists || !targetExists) {
      console.warn(
        `Removing invalid link: ${link.source} -> ${link.target} (source exists: ${sourceExists}, target exists: ${targetExists})`
      );
    }
    return sourceExists && targetExists;
  });

  if (validLinks.length < newFrame.links.length) {
    console.warn(
      `Removed ${newFrame.links.length - validLinks.length} invalid links`
    );
  }

  // Updated links array with only valid links
  newFrame.links = validLinks;

  // ***************** STEP 1: CALCULATE X POSITIONS *****************

  // Group nodes by layer
  const nodesByLayer = new Map<number, string[]>();
  const allLayers = new Set<number>();

  // First, determine node layers if not in cache
  normalizedNodes.forEach((node) => {
    // Check if the node is already in our cache
    if (!cache.nodePositions.has(node.name)) {
      // This is a new node, determine its layer
      // For simplicity, use incoming/outgoing links to determine layer
      const incomingLinks = newFrame.links.filter(
        (l) => l.target === node.name
      );
      const outgoingLinks = newFrame.links.filter(
        (l) => l.source === node.name
      );

      let layer = 0;

      if (incomingLinks.length === 0 && outgoingLinks.length > 0) {
        // Source node (no incoming links)
        layer = 0;
      } else if (outgoingLinks.length === 0 && incomingLinks.length > 0) {
        // Sink node (no outgoing links)
        // Assign to the rightmost layer we've seen so far + 1
        layer = Math.max(...Array.from(allLayers), 0) + 1;
      } else if (incomingLinks.length > 0 && outgoingLinks.length > 0) {
        // Intermediate node
        // Use max layer of incoming nodes + 1
        const sourceNodes = incomingLinks.map((l) => l.source);
        const sourceLayers = sourceNodes
          .map((name) => cache.nodePositions.get(name)?.yIndex || 0)
          .filter((l) => l > 0);

        if (sourceLayers.length > 0) {
          layer = Math.max(...sourceLayers) + 1;
        } else {
          // If we can't determine from sources, try a middle layer
          layer = 1; // Default intermediate layer
        }
      }

      // Add to cache with newly determined layer
      cache.nodePositions.set(node.name, {
        y: 0, // Will be calculated later
        height: 0, // Will be calculated later
        yIndex: layer,
        lastSeen: currentTick,
      });
    }

    // Update last seen timestamp
    const nodeInfo = cache.nodePositions.get(node.name);
    if (nodeInfo) {
      nodeInfo.lastSeen = currentTick;
      cache.nodePositions.set(node.name, nodeInfo);

      // Add to layer groups for layout
      const layer = nodeInfo.yIndex;
      allLayers.add(layer);

      if (!nodesByLayer.has(layer)) {
        nodesByLayer.set(layer, []);
      }
      nodesByLayer.get(layer)?.push(node.name);
    }
  });

  // ***************** STEP 2: CALCULATE NODE VALUES AND HEIGHTS *****************

  // Calculate total flow for each node in this frame
  const nodeValues = new Map<string, number>();
  newFrame.links.forEach((link) => {
    // Add to source node value
    const sourceValue = nodeValues.get(link.source) || 0;
    nodeValues.set(link.source, sourceValue + link.value);

    // Add to target node value
    const targetValue = nodeValues.get(link.target) || 0;
    nodeValues.set(link.target, targetValue + link.value);

    // Update link value in cache with exponential smoothing
    const linkKey = `${link.source}->${link.target}`;
    const oldValue = cache.linkValues.get(linkKey) || link.value;
    const smoothingFactor = 0.3; // Lower = smoother, higher = more responsive
    const newValue =
      oldValue * (1 - smoothingFactor) + link.value * smoothingFactor;
    cache.linkValues.set(linkKey, newValue);
  });

  // Layout configuration
  const margins = {
    top: 20,
    bottom: 20,
    left: 30,
    right: 30,
  };

  const usableHeight = height - margins.top - margins.bottom;
  const usableWidth = width - margins.left - margins.right;
  const nodeWidth = 20;
  const nodePadding = 10;

  // Determine node heights based on values
  const layerCount = Math.max(...allLayers) + 1;
  const maxNodeHeight = Math.min(100, Math.floor(usableHeight / 5)); // Max node height limited
  const minNodeHeight = 15;

  // Distribute layers evenly across x-axis
  const xPositions = new Map<number, number>();
  for (let layer = 0; layer < layerCount; layer++) {
    const x =
      margins.left + (layer * usableWidth) / Math.max(1, layerCount - 1);
    xPositions.set(layer, x);
  }

  // Collect all visible nodes
  const visibleNodeNames = new Set(normalizedNodes.map((n) => n.name));

  // ***************** STEP 3: SORT AND POSITION NODES VERTICALLY *****************

  // Sort nodes within each layer to maintain stability
  nodesByLayer.forEach((nodes, layer) => {
    // Sort by cached y-position to maintain order
    nodes.sort((a, b) => {
      const posA = cache.nodePositions.get(a);
      const posB = cache.nodePositions.get(b);

      // If both exist, sort by y-position
      if (posA && posB) {
        return posA.y - posB.y;
      }

      // If only one exists, put the existing one first
      return posA ? -1 : 1;
    });

    // Calculate total value in this layer for proportional heights
    const layerTotalValue = nodes.reduce(
      (sum, nodeName) => sum + (nodeValues.get(nodeName) || 1),
      0
    );

    // Calculate the height available for this layer
    const nodeCount = nodes.length;
    const availableHeight = usableHeight - (nodeCount - 1) * nodePadding;

    // Calculate the total height that will be used by all nodes + padding
    const totalNodesHeight =
      nodes.reduce((sum, nodeName) => {
        const nodeValue = Math.max(1, nodeValues.get(nodeName) || 1);
        const proportion = nodeValue / Math.max(1, layerTotalValue);
        const nodeHeight = Math.max(
          minNodeHeight,
          Math.min(maxNodeHeight, Math.floor(proportion * availableHeight))
        );
        return sum + nodeHeight;
      }, 0) +
      (nodes.length - 1) * nodePadding;

    // Center the nodes vertically in the available space
    const verticalOffset = Math.max(0, (usableHeight - totalNodesHeight) / 2);

    // Calculate node heights with smoothing applied
    // Start at the top margin plus vertical centering offset
    let y = margins.top + verticalOffset;

    nodes.forEach((nodeName, index) => {
      const nodeInfo = cache.nodePositions.get(nodeName);
      if (!nodeInfo) return;

      // Calculate proportional height
      const nodeValue = Math.max(1, nodeValues.get(nodeName) || 1);
      const proportion = nodeValue / Math.max(1, layerTotalValue);
      const targetHeight = Math.max(
        minNodeHeight,
        Math.min(maxNodeHeight, Math.floor(proportion * availableHeight))
      );

      // Apply smoothing to height
      const oldHeight = nodeInfo.height || targetHeight;
      const smoothingFactor = 0.3; // Adjust for more/less smoothing
      const newHeight = Math.round(
        oldHeight * (1 - smoothingFactor) + targetHeight * smoothingFactor
      );

      // Apply smoothing to y-position
      const targetY = y;
      const oldY = nodeInfo.y || targetY;
      const newY = Math.round(
        oldY * (1 - smoothingFactor) + targetY * smoothingFactor
      );

      // Update cache
      nodeInfo.y = newY;
      nodeInfo.height = newHeight;
      cache.nodePositions.set(nodeName, nodeInfo);

      // Increment y for next node
      y += newHeight + nodePadding;
    });
  });

  // ***************** STEP 4: BUILD NODE POSITIONS AND LINK PATHS *****************

  // Generate node positions for this frame
  const nodePositions: Record<string, any> = {};

  normalizedNodes.forEach((node) => {
    const nodeInfo = cache.nodePositions.get(node.name);
    if (!nodeInfo) return;

    const layer = nodeInfo.yIndex;
    const x = xPositions.get(layer) || margins.left;

    nodePositions[node.name] = {
      x,
      y: nodeInfo.y,
      height: nodeInfo.height,
      width: nodeWidth,
      layer,
    };
  });

  // Generate link paths
  const linkPaths: {
    source: string;
    target: string;
    path: string;
    value: number;
  }[] = [];

  // Map to track used connection points
  const sourcePortsUsed = new Map<string, number[]>();
  const targetPortsUsed = new Map<string, number[]>();

  newFrame.links.forEach((link) => {
    const sourcePos = nodePositions[link.source];
    const targetPos = nodePositions[link.target];

    if (!sourcePos || !targetPos) return;

    // Function to calculate a connection point
    const getConnectionPoint = (
      pos: any,
      isSource: boolean,
      linkValue: number
    ) => {
      const nodeName = isSource ? link.source : link.target;
      const portsMap = isSource ? sourcePortsUsed : targetPortsUsed;

      // Initialize if needed
      if (!portsMap.has(nodeName)) {
        portsMap.set(nodeName, []);
      }

      // Get used ports
      const usedPorts = portsMap.get(nodeName) || [];

      // Number of ports based on node height
      const nodeHeight = pos.height;
      const maxPorts = Math.max(3, Math.floor(nodeHeight / 10));

      // Find an unused port number (0 = top, maxPorts-1 = bottom)
      let portIndex = Math.floor(maxPorts / 2); // Start from middle

      // Try to find an unused port near the middle
      for (let offset = 0; offset < maxPorts; offset++) {
        // Try alternating above and below the middle
        const tryPort =
          portIndex + (offset % 2 === 0 ? offset / 2 : -Math.ceil(offset / 2));
        if (
          tryPort >= 0 &&
          tryPort < maxPorts &&
          !usedPorts.includes(tryPort)
        ) {
          portIndex = tryPort;
          break;
        }
      }

      // Mark this port as used
      usedPorts.push(portIndex);
      portsMap.set(nodeName, usedPorts);

      // Calculate the y position based on the port
      const portSpacing = nodeHeight / (maxPorts + 1);
      const y = pos.y + portSpacing * (portIndex + 1);

      // X position is either the right or left edge of the node
      const x = isSource ? pos.x + pos.width : pos.x;

      return { x, y };
    };

    // Calculate connection points
    const sourcePoint = getConnectionPoint(sourcePos, true, link.value);
    const targetPoint = getConnectionPoint(targetPos, false, link.value);

    // Create a curve between the nodes
    const path = `
      M ${sourcePoint.x},${sourcePoint.y}
      C ${sourcePoint.x + (targetPoint.x - sourcePoint.x) * 0.5},${
      sourcePoint.y
    }
          ${sourcePoint.x + (targetPoint.x - sourcePoint.x) * 0.5},${
      targetPoint.y
    }
          ${targetPoint.x},${targetPoint.y}
    `;

    // Use smoothed link value
    const linkKey = `${link.source}->${link.target}`;
    const smoothedValue = cache.linkValues.get(linkKey) || link.value;

    linkPaths.push({
      source: link.source,
      target: link.target,
      path: path.trim(),
      value: smoothedValue,
    });
  });

  // Update the last tick in the cache
  cache.lastTick = currentTick;

  // Clean up nodes that haven't been seen recently
  // (after 5 frames/ticks of absence)
  if (currentTick > 5) {
    const staleThreshold = currentTick - 5;

    for (const [nodeName, nodeInfo] of cache.nodePositions.entries()) {
      if (
        nodeInfo.lastSeen < staleThreshold &&
        !visibleNodeNames.has(nodeName)
      ) {
        cache.nodePositions.delete(nodeName);
      }
    }

    // Clean up stale link values (those not in the current frame)
    const currentLinkKeys = newFrame.links.map(
      (l) => `${l.source}->${l.target}`
    );
    for (const linkKey of cache.linkValues.keys()) {
      if (!currentLinkKeys.includes(linkKey)) {
        cache.linkValues.delete(linkKey);
      }
    }
  }

  // Create the final layout state
  const layoutState: LayoutState = {
    timestamp: newFrame.timestamp,
    nodePositions,
    linkPaths,
  };

  return {
    layoutState,
    smoothingCache: cache,
  };
}
