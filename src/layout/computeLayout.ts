// src/layout/computeLayout.ts
import * as d3 from "d3";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
} from "d3-sankey";

export interface FrameData {
  timestamp: string;
  tick?: number; // Optional tick number for real-time data
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
}

export interface LayoutState {
  timestamp: string;
  nodePositions: {
    [nodeName: string]: {
      x: number;
      y: number;
      height: number;
      width?: number;
      layer: number;
    };
  };
  linkPaths: {
    source: string;
    target: string;
    path: string;
    value: number;
  }[];
}

interface Node {
  name: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  layer?: number;
  sourceLinks?: any[];
  targetLinks?: any[];
  depth?: number;
  value?: number;
  index?: number;
}

interface Link {
  source: any;
  target: any;
  value: number;
  width?: number;
}

/**
 * Compute a stable layout for all frames in a Sankey diagram animation
 */
export function computeLayout(
  frames: FrameData[],
  width = 800,
  height = 600
): LayoutState[] {
  if (!frames.length) return [];

  console.log("Computing stable Sankey layout for historical data...");

  // ***************** STEP 1: GATHER DATA *****************

  // Collect all unique nodes across all frames
  const allNodes = new Map<string, Node>();
  frames.forEach((frame) => {
    frame.nodes.forEach((node) => {
      if (!allNodes.has(node.name)) {
        allNodes.set(node.name, { name: node.name });
      }
    });
  });

  // Calculate total flow value for each node across all frames
  const nodeValues = new Map<string, number>();
  frames.forEach((frame) => {
    frame.links.forEach((link) => {
      if (!allNodes.has(link.source) || !allNodes.has(link.target)) return;

      // Add to source node value
      const sourceValue = nodeValues.get(link.source) || 0;
      nodeValues.set(link.source, sourceValue + link.value);

      // Add to target node value
      const targetValue = nodeValues.get(link.target) || 0;
      nodeValues.set(link.target, targetValue + link.value);
    });
  });

  // Record when each node first appears
  const nodeFirstAppearance = new Map<string, string>();
  const sortedFrames = [...frames].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  sortedFrames.forEach((frame) => {
    frame.nodes.forEach((node) => {
      if (!nodeFirstAppearance.has(node.name)) {
        nodeFirstAppearance.set(node.name, frame.timestamp);
      }
    });
  });

  // ***************** STEP 2: ESTABLISH LAYERS *****************

  // Create a reference frame with the most nodes+links for initial layer calculation
  let bestFrameIndex = 0;
  let maxElements = 0;
  frames.forEach((frame, index) => {
    const totalElements = frame.nodes.length + frame.links.length;
    if (totalElements > maxElements) {
      maxElements = totalElements;
      bestFrameIndex = index;
    }
  });
  const referenceFrame = frames[bestFrameIndex];

  // Initialize nodes with consistent indices
  const nodeMap = new Map<string, number>();
  const fullNodes = Array.from(allNodes.keys()).map((name, index) => {
    nodeMap.set(name, index);
    return { name, index };
  });

  // Filter links to ensure they reference valid nodes
  const validLinks = referenceFrame.links.filter(
    (link) => nodeMap.has(link.source) && nodeMap.has(link.target)
  );

  const tempLinks = validLinks.map((link) => ({
    source: nodeMap.get(link.source) as number,
    target: nodeMap.get(link.target) as number,
    value: link.value,
  }));

  // Adjust margins based on chart size and node count
  // Use smaller margins, especially at the top, to maximize usable space
  const nodeCount = allNodes.size;
  const marginScalingFactor = Math.max(0.05, Math.min(0.12, 10 / nodeCount));
  const margins = {
    left: Math.max(40, Math.round(width * marginScalingFactor)),
    right: Math.max(40, Math.round(width * marginScalingFactor)),
    top: Math.max(30, Math.round(height * 0.05)), // Increased to ensure content isn't too high
    bottom: Math.max(30, Math.round(height * 0.05)), // Ensure equal margins top and bottom for centering
  };

  // Adjust node width and padding based on chart dimensions
  const nodeWidth = Math.min(28, Math.max(15, Math.round(width / 45)));

  // Calculate padding based on available height and node count
  // With smaller padding for many nodes, larger padding for few nodes
  const usableHeight = height - margins.top - margins.bottom;
  const avgNodesPerLayer =
    nodeCount / (Math.max(...fullNodes.map((n) => n.index || 0)) + 1);
  const nodePadding = Math.max(
    8, // Minimum padding
    Math.min(25, Math.floor(usableHeight / (avgNodesPerLayer * 2.5)))
  );

  // Calculate layers using d3-sankey
  const tempSankey = d3Sankey<Node, Link>()
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .extent([
      [margins.left, margins.top],
      [width - margins.right, height - margins.bottom],
    ])
    .nodeAlign(sankeyJustify);

  // Apply the sankey layout to get initial layer assignments
  const { nodes: layeredNodes } = tempSankey({
    nodes: fullNodes,
    links: tempLinks,
  });

  // Store the layer (depth) information on our node objects
  layeredNodes.forEach((node) => {
    const originalNode = allNodes.get(node.name);
    if (originalNode) {
      originalNode.layer = node.depth;
      originalNode.value = node.value;
    }
  });

  // ***************** STEP 3: GROUP NODES BY LAYER *****************

  // Group nodes by their assigned layer
  const nodesByLayer = new Map<number, Node[]>();
  Array.from(allNodes.values()).forEach((node) => {
    const layer = node.layer || 0;
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, []);
    }
    nodesByLayer.get(layer)?.push(node);
  });

  // ***************** STEP 4: VERTICAL POSITIONING *****************

  // Determine nodes with most connections
  const connectionCounts = new Map<string, number>();

  frames.forEach((frame) => {
    frame.links.forEach((link) => {
      // Count source connections
      const sourceConnections = connectionCounts.get(link.source) || 0;
      connectionCounts.set(link.source, sourceConnections + 1);

      // Count target connections
      const targetConnections = connectionCounts.get(link.target) || 0;
      connectionCounts.set(link.target, targetConnections + 1);
    });
  });

  // Sort nodes by importance (value and connections)
  nodesByLayer.forEach((nodes, layer) => {
    nodes.sort((a, b) => {
      // Get values
      const valueA = nodeValues.get(a.name) || 0;
      const valueB = nodeValues.get(b.name) || 0;

      // Get connection counts
      const connectionsA = connectionCounts.get(a.name) || 0;
      const connectionsB = connectionCounts.get(b.name) || 0;

      // Weighted score that considers both value and connections
      const scoreA = valueA * 0.7 + connectionsA * 10;
      const scoreB = valueB * 0.7 + connectionsB * 10;

      // Put more important nodes in the middle
      if (Math.abs(scoreB - scoreA) > Math.min(scoreA, scoreB) * 0.2) {
        return scoreB - scoreA;
      }

      // If scores are close, use alphabetical order for stability
      return a.name.localeCompare(b.name);
    });
  });

  // Calculate node heights and vertical positions
  const yPositions = new Map<string, number>();
  const nodeHeights = new Map<string, number>();

  // Base minimum node height on chart dimensions
  const minNodeHeight = Math.max(15, Math.min(30, Math.floor(height / 20)));

  // Find max total value to normalize heights
  const maxLayerTotalValue = Math.max(
    ...Array.from(nodesByLayer.entries()).map(([_, nodes]) =>
      nodes.reduce((sum, node) => sum + (nodeValues.get(node.name) || 0), 0)
    )
  );

  // Center the nodes vertically in the available space
  nodesByLayer.forEach((nodes, layer) => {
    if (!nodes.length) return;

    // Calculate total value in this layer
    const layerTotalValue = nodes.reduce(
      (sum, node) => sum + (nodeValues.get(node.name) || 1),
      0
    );

    // Use more of the available height - scale up node heights
    const heightScalingFactor = Math.min(1.5, 3 / Math.sqrt(nodes.length));
    const totalAvailableHeight =
      usableHeight - (nodes.length - 1) * nodePadding;

    // Normalize heights to fit within available space and maintain proportions
    let totalHeight = 0;

    // First pass: calculate proportional heights
    nodes.forEach((node) => {
      const nodeValue = Math.max(1, nodeValues.get(node.name) || 1);
      const proportion = nodeValue / layerTotalValue;
      // Scale up smaller nodes, ensure minimum node height for visibility
      const calculatedHeight = Math.max(
        minNodeHeight,
        Math.min(
          100,
          Math.floor(proportion * totalAvailableHeight * heightScalingFactor)
        )
      );
      nodeHeights.set(node.name, calculatedHeight);
      totalHeight += calculatedHeight + nodePadding;
    });
    totalHeight -= nodePadding; // Remove last padding

    // If total exceeds available height, scale down proportionally
    if (totalHeight > usableHeight) {
      const scaleFactor = usableHeight / totalHeight;
      nodes.forEach((node) => {
        const currentHeight = nodeHeights.get(node.name) || minNodeHeight;
        const scaledHeight = Math.max(
          minNodeHeight,
          Math.floor(currentHeight * scaleFactor)
        );
        nodeHeights.set(node.name, scaledHeight);
      });

      // Recalculate total height
      totalHeight = nodes.reduce(
        (sum, node) =>
          sum + (nodeHeights.get(node.name) || minNodeHeight) + nodePadding,
        -nodePadding
      );
    }

    // Center nodes vertically in the available space
    // This ensures equal space above and below the diagram
    let y = margins.top + (usableHeight - totalHeight) / 2;

    // Assign y positions
    nodes.forEach((node) => {
      const height = nodeHeights.get(node.name) || minNodeHeight;
      yPositions.set(node.name, y);
      y += height + nodePadding;
    });
  });

  // ***************** STEP 5: HORIZONTAL POSITIONING *****************

  // Calculate x positions for each layer
  const xPositions = new Map<number, number>();
  const layerCount = Math.max(...Array.from(nodesByLayer.keys())) + 1;
  const usableWidth = width - margins.left - margins.right - nodeWidth;

  // Distribute layers evenly across the width
  for (let layer = 0; layer < layerCount; layer++) {
    if (layerCount === 1) {
      // Single layer case
      xPositions.set(layer, margins.left);
    } else {
      // Multiple layers - distribute evenly
      const x = margins.left + (layer * usableWidth) / (layerCount - 1);
      xPositions.set(layer, x);
    }
  }

  // ***************** STEP 6: COMPUTE LAYOUT STATES FOR EACH FRAME *****************

  const layoutStates: LayoutState[] = [];

  for (const frame of frames) {
    try {
      // Skip empty frames
      if (!frame.nodes.length) continue;

      // Create mapping for nodes in this frame
      const frameNodeSet = new Set(frame.nodes.map((n) => n.name));

      // Generate node positions for this frame
      const nodePositions: Record<string, any> = {};

      frame.nodes.forEach((frameNode) => {
        const nodeName = frameNode.name;
        const layer = allNodes.get(nodeName)?.layer || 0;
        const x = xPositions.get(layer) || margins.left;
        const y = yPositions.get(nodeName) || margins.top;
        const height = nodeHeights.get(nodeName) || minNodeHeight;

        nodePositions[nodeName] = {
          x,
          y,
          height,
          width: nodeWidth,
          layer,
        };
      });

      // Get valid links (both source and target must exist in this frame)
      const frameLinks = frame.links.filter(
        (link) => frameNodeSet.has(link.source) && frameNodeSet.has(link.target)
      );

      // Generate link paths
      const linkPaths: {
        source: string;
        target: string;
        path: string;
        value: number;
      }[] = [];

      // Map to track which source/target ports are already used
      const sourcePortsUsed = new Map<string, number[]>();
      const targetPortsUsed = new Map<string, number[]>();

      frameLinks.forEach((link) => {
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
              portIndex +
              (offset % 2 === 0 ? offset / 2 : -Math.ceil(offset / 2));
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

        linkPaths.push({
          source: link.source,
          target: link.target,
          path: path.trim(),
          value: link.value,
        });
      });

      // Add the layout state for this frame
      layoutStates.push({
        timestamp: frame.timestamp,
        nodePositions,
        linkPaths,
      });
    } catch (error) {
      console.error(`Error processing frame ${frame.timestamp}:`, error);
    }
  }

  console.log(`Generated ${layoutStates.length} layout states`);
  return layoutStates;
}
