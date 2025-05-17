import * as d3 from "d3";
import {
  updateNodePosition,
  getCustomNodePositions,
  FrameData,
} from "../layout/computeLayout";

interface Node {
  name: string;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

/**
 * Adds drag behavior to node elements in a Sankey diagram
 * @param nodeElements D3 selection of node elements
 * @param frames The current frame data
 * @param onPositionUpdate Callback when node positions are updated
 */
export function addNodeDragBehavior(
  nodeElements: d3.Selection<SVGGElement, Node, SVGElement, unknown>,
  frames: FrameData[],
  onPositionUpdate: (updatedFrames: FrameData[]) => void
) {
  // Create drag behavior
  const dragBehavior = d3
    .drag<SVGGElement, Node>()
    .on(
      "start",
      function (event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
        d3.select(this).classed("dragging", true);
        console.log(`Started dragging node: ${d.name}`);
      }
    )
    .on(
      "drag",
      function (event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
        // Get current transform
        const transform = d3.select(this).attr("transform") || "";
        const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(transform);

        if (!match) return;

        // Calculate new position based on drag delta
        const currentX = parseFloat(match[1]);
        const currentY = parseFloat(match[2]);
        const newX = currentX + event.dx;
        const newY = currentY + event.dy;

        // Update node position visually
        d3.select(this).attr("transform", `translate(${newX}, ${newY})`);

        // Update all associated elements (connections, etc.)
        updateConnectedElements(d.name, newX, newY);
      }
    )
    .on(
      "end",
      function (event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
        d3.select(this).classed("dragging", false);

        // Get final position
        const transform = d3.select(this).attr("transform");
        const match = transform
          ? /translate\(([^,]+),\s*([^)]+)\)/.exec(transform)
          : null;

        if (match) {
          const finalX = parseFloat(match[1]);
          const finalY = parseFloat(match[2]);

          // Update the data model
          const updatedFrames = updateNodePosition(
            frames,
            d.name,
            finalX,
            finalY
          );

          // Notify parent component
          onPositionUpdate(updatedFrames);
        }
      }
    );

  // Apply drag behavior to all node elements
  nodeElements.call(dragBehavior);
}

/**
 * Updates elements connected to a node when it moves
 * @param nodeName The name of the node being dragged
 * @param newX New X position
 * @param newY New Y position
 */
function updateConnectedElements(nodeName: string, newX: number, newY: number) {
  // Get the node dimensions
  const nodeElement = d3.select(`.node[data-node-name="${nodeName}"]`);
  const rect = nodeElement.select("rect");
  const width = parseFloat(rect.attr("width") || "0");
  const height = parseFloat(rect.attr("height") || "0");

  // Update source links - these are links where this node is the source
  d3.selectAll(`.link path[data-source="${nodeName}"]`).each(function () {
    const pathElement = d3.select(this);
    const pathData = pathElement.attr("d");

    if (pathData) {
      // Extract the original path data - we need to update the start point
      // A typical path looks like: M x,y C x1,y1 x2,y2 x3,y3
      const pathParts = pathData
        .trim()
        .split(/[MC\s]+/)
        .filter(Boolean);

      if (pathParts.length >= 4) {
        // The new starting point is at the right edge of the node
        const newStartX = newX + width;
        const newStartY = newY + height / 2; // Approximately centered vertically

        // Keep control points and end point, just update the start
        const newPath = `M ${newStartX},${newStartY} C ${pathParts[1]} ${pathParts[2]} ${pathParts[3]}`;

        pathElement.attr("d", newPath);
      }
    }
  });

  // Update target links - these are links where this node is the target
  d3.selectAll(`.link path[data-target="${nodeName}"]`).each(function () {
    const pathElement = d3.select(this);
    const pathData = pathElement.attr("d");

    if (pathData) {
      // Extract the original path data - we need to update the end point
      // A typical path looks like: M x,y C x1,y1 x2,y2 x3,y3
      const pathParts = pathData
        .trim()
        .split(/[MC\s]+/)
        .filter(Boolean);

      if (pathParts.length >= 4) {
        // The new ending point is at the left edge of the node
        const newEndX = newX;
        const newEndY = newY + height / 2; // Approximately centered vertically

        // Keep starting point and control points, just update the end
        const x1y1 = pathParts[1].split(",");
        const x2y2 = pathParts[2].split(",");
        const newPath = `M ${pathParts[0]} C ${x1y1[0]},${x1y1[1]} ${x2y2[0]},${newEndY} ${newEndX},${newEndY}`;

        pathElement.attr("d", newPath);
      }
    }
  });

  // Update any node labels or connectors
  d3.selectAll(`.label-connector[data-node="${nodeName}"]`).each(function () {
    const connectorElement = d3.select(this);
    // Calculate the node center
    const nodeCenterX = newX + width / 2;
    const nodeCenterY = newY + height / 2;

    // Extract the current path data
    const pathData = connectorElement.attr("d");
    if (pathData) {
      // A typical connector path is M x1,y1 L x2,y2
      const pathParts = pathData.split(/[ML\s]+/).filter(Boolean);
      if (pathParts.length >= 2) {
        // Update only the start point (node center)
        const labelPos = pathParts[1].split(",");
        const newPath = `M ${nodeCenterX},${nodeCenterY} L ${labelPos[0]},${labelPos[1]}`;
        connectorElement.attr("d", newPath);
      }
    }
  });
}

/**
 * Resets all custom node positions in the given frames
 * @param frames The current frame data
 * @returns Updated frames with all custom positions removed
 */
export function resetNodePositions(frames: FrameData[]): FrameData[] {
  return frames.map((frame) => {
    return {
      ...frame,
      nodes: frame.nodes.map((node) => {
        // Create a new node object without customX and customY properties
        const { customX, customY, ...rest } = node;
        return rest;
      }),
    };
  });
}
