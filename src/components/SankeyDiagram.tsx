import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { computeLayout, LayoutState, FrameData } from "../layout/computeLayout";
import "./SankeyDiagram.css";

// Define the type for label position overrides
type LabelOverride = {
  dx: number;
  dy: number;
};

// Define the type for node ID (used in the override map)
type NodeId = string;

// Extended Node interface with additional properties for drag tracking
interface Node {
  name: string;
  value?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  depth?: number;
  layer?: number;
  depthCategory?: "source" | "intermediate" | "sink";
  sourceLinks?: Link[];
  targetLinks?: Link[];
  // Additional properties for label positioning
  origX?: number;
  origY?: number;
  textAnchor?: string;
}

interface Link {
  source: string | number | Node;
  target: string | number | Node;
  value: number;
  width?: number;
  path?: string;
}

interface SankeyData {
  nodes: Node[];
  links: Link[];
}

interface ColorConfig {
  nodes: {
    source: string;
    intermediate: string;
    sink: string;
    hover: string;
  };
  links: {
    base: string;
    hoverOpacity: number;
    defaultOpacity: number;
  };
  thresholds: {
    warning: number;
    critical: number;
    warningColor: string;
    criticalColor: string;
  };
}

interface SankeyDiagramProps {
  data?: SankeyData | null;
  snapshots?: FrameData[]; // Added for multiple frames
  currentIndex?: number; // Current frame index
  resetLabelsRef?: React.MutableRefObject<(() => void) | null>; // Add ref for reset function
}

// Extend the Window interface to include our debug functions
declare global {
  interface Window {
    updateDebugStatus?: (status: string) => void;
    updateDebugEvents?: (events: string) => void;
  }
}

const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  data,
  snapshots = [],
  currentIndex = 0,
  resetLabelsRef,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutStates, setLayoutStates] = useState<LayoutState[]>([]);
  const [currentLayoutState, setCurrentLayoutState] =
    useState<LayoutState | null>(null);
  const [colorScale, setColorScale] =
    useState<d3.ScaleOrdinal<string, string, never>>();
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Debug status refs - avoid using nested useEffect hooks
  const statusTextRef =
    useRef<d3.Selection<SVGTextElement, unknown, null, undefined>>(null);
  const eventTextRef =
    useRef<d3.Selection<SVGTextElement, unknown, null, undefined>>(null);

  // Add state for tracking label position overrides
  const [labelOverrides, setLabelOverrides] = useState<
    Map<NodeId, LabelOverride>
  >(new Map());

  // Create a cache to maintain label positions across frames
  const labelPositionCache = useRef(
    new Map<
      string,
      {
        x: number;
        y: number;
        anchor: string;
        textX: number;
        textY: number;
      }
    >()
  ).current;

  // Add state for link label position overrides
  const [linkLabelOverrides, setLinkLabelOverrides] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());

  const width = dimensions.width;
  const height = dimensions.height;
  const margin = { top: 5, right: 20, bottom: 5, left: 20 };

  // Helper function to generate a position key for a node
  const getPositionKey = (node: Node): string => {
    return `node-${node.name}-${node.depthCategory || ""}`;
  };

  const colorConfig: ColorConfig = {
    nodes: {
      source: "#4caf50",
      intermediate: "#2196f3",
      sink: "#f44336",
      hover: "#ff9800",
    },
    links: {
      base: "#bdbdbd",
      hoverOpacity: 0.8,
      defaultOpacity: 0.5,
    },
    thresholds: {
      warning: 15,
      critical: 20,
      warningColor: "#ffeb3b",
      criticalColor: "#d32f2f",
    },
  };

  // Setup debug status updating functions
  useEffect(() => {
    // Set up global functions for updating debug status
    window.updateDebugStatus = function (status: string) {
      if (statusTextRef.current) {
        statusTextRef.current.text(`Status: ${status}`);
      }
    };

    window.updateDebugEvents = function (events: string) {
      if (eventTextRef.current) {
        eventTextRef.current.text(`Events: ${events}`);
      }
    };

    return () => {
      delete window.updateDebugStatus;
      delete window.updateDebugEvents;
    };
  }, []);

  // Compute stable layout for all frames
  useEffect(() => {
    if (snapshots.length === 0) return;

    try {
      console.log(`Computing layout for ${snapshots.length} frames...`);

      // Validate input data
      const validSnapshots = snapshots.filter((snapshot) => {
        if (!snapshot.nodes || !snapshot.links || snapshot.nodes.length === 0) {
          console.warn(`Skipping snapshot with invalid data:`, snapshot);
          return false;
        }
        return true;
      });

      if (validSnapshots.length === 0) {
        setError("No valid snapshots found in the data");
        return;
      }

      const states = computeLayout(validSnapshots, width, height);

      if (states.length === 0) {
        setError("Layout computation failed to produce any valid states");
        return;
      }

      setLayoutStates(states);
      setError(null);

      // Create color scale for nodes
      const allNodeNames = new Set<string>();
      validSnapshots.forEach((frame) => {
        frame.nodes.forEach((node) => allNodeNames.add(node.name));
      });

      setColorScale(
        d3
          .scaleOrdinal<string>()
          .domain(Array.from(allNodeNames))
          .range(d3.schemeCategory10)
      );
    } catch (err) {
      console.error("Error computing layout:", err);
      setError("Error in layout computation");
    }
  }, [snapshots, width, height]);

  // Update current layout state when index changes
  useEffect(() => {
    if (!layoutStates.length) return;

    // Ensure currentIndex is within bounds
    const safeIndex = Math.min(
      Math.max(0, currentIndex),
      layoutStates.length - 1
    );
    setCurrentLayoutState(layoutStates[safeIndex]);
  }, [layoutStates, currentIndex]);

  // Function to reset all label overrides
  const resetLabelOverrides = () => {
    setLabelOverrides(new Map());
    setLinkLabelOverrides(new Map());
  };

  // Expose the reset function to the parent component through the ref
  useEffect(() => {
    if (resetLabelsRef) {
      resetLabelsRef.current = resetLabelOverrides;
    }
    return () => {
      if (resetLabelsRef) {
        resetLabelsRef.current = null;
      }
    };
  }, [resetLabelsRef, setLabelOverrides, setLinkLabelOverrides]);

  // Function to get node ID from node object
  const getNodeId = (node: Node): NodeId => {
    return `node-${node.name}`;
  };

  // Function to redraw leader line between node and its label
  const updateLeaderLine = (
    g: d3.Selection<Element, unknown, null, undefined>,
    node: Node,
    labelX: number,
    labelY: number,
    labelWidth: number,
    labelHeight: number
  ) => {
    const width = (node.x1 || 0) - (node.x0 || 0);
    const height = (node.y1 || 0) - (node.y0 || 0);
    const nodeCenterX = (node.x0 ?? 0) + width / 2;
    const nodeCenterY = (node.y0 ?? 0) + height / 2;
    const labelCenterX = labelX + labelWidth / 2;
    const labelCenterY = labelY + labelHeight / 2;

    // Find the SVG parent element - use the ownerSVGElement property from the DOM node
    const domNode = g.node() as SVGElement;
    const svgElement = domNode?.ownerSVGElement;
    if (!svgElement) return;

    const svgParent = d3.select(svgElement);

    // Remove any existing connectors for this node
    svgParent.selectAll(`.label-connector[data-node="${node.name}"]`).remove();

    // Distance threshold - only draw connector if the label is far from the node
    const distanceThreshold = Math.min(width, height) * 0.2;
    const distance = Math.sqrt(
      Math.pow(nodeCenterX - labelCenterX, 2) +
        Math.pow(nodeCenterY - labelCenterY, 2)
    );

    // Add connector line if the label is far from its node
    if (distance > distanceThreshold) {
      svgParent
        .append("path")
        .attr("class", "label-connector")
        .attr("data-node", node.name)
        .attr(
          "d",
          `M${nodeCenterX},${nodeCenterY} L${labelCenterX},${labelCenterY}`
        )
        .attr("stroke", "rgba(255, 255, 255, 0.4)")
        .attr("stroke-width", 0.8)
        .attr("stroke-dasharray", "2,2")
        .attr("fill", "none")
        .attr("pointer-events", "none");
    }
  };

  // Render the chart using the current layout state
  useEffect(() => {
    if (!svgRef.current || !currentLayoutState) return;

    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove(); // Clear previous rendering

      // Create layered groups for proper z-index ordering
      const baseGroup = svg.append("g");
      const linksGroup = baseGroup.append("g").attr("class", "links-layer");
      const nodesGroup = baseGroup.append("g").attr("class", "nodes-layer");
      const linkLabelsGroup = baseGroup
        .append("g")
        .attr("class", "link-labels-layer");
      const nodeLabelsGroup = baseGroup
        .append("g")
        .attr("class", "node-labels-layer");

      // Get all nodes and links from current layout state
      const nodeNames = Object.keys(currentLayoutState.nodePositions);

      if (nodeNames.length === 0) {
        console.warn("No nodes in current layout state");
        return;
      }

      const nodes: Node[] = nodeNames.map((name) => {
        const pos = currentLayoutState.nodePositions[name];
        return {
          name,
          x0: pos.x,
          x1: pos.x + (pos.width || 20),
          y0: pos.y,
          y1: pos.y + pos.height,
          layer: pos.layer,
          // Determine node type by layer
          depthCategory:
            pos.layer === 0
              ? "source"
              : currentLayoutState.linkPaths.some(
                  (l) =>
                    l.target === name &&
                    !currentLayoutState.linkPaths.some(
                      (l2) => l2.source === name
                    )
                )
              ? "sink"
              : "intermediate",
        };
      });

      if (currentLayoutState.linkPaths.length === 0) {
        console.warn("No links in current layout state");
      }

      const links: Link[] = currentLayoutState.linkPaths.map((linkPath) => ({
        source: linkPath.source,
        target: linkPath.target,
        value: linkPath.value,
        path: linkPath.path,
      }));

      // Create the collision tracking system
      type BoundingBox = {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        node?: string; // Node name for identification
        priority: number; // Higher number = higher priority
      };

      // Array to track all occupied areas for collision detection
      const occupiedAreas: BoundingBox[] = [];

      // Function to check if a new label would overlap with existing labels
      const wouldOverlap = (box: BoundingBox) => {
        // Check against all existing boxes
        for (const area of occupiedAreas) {
          if (
            !(
              box.x2 < area.x1 ||
              box.x1 > area.x2 ||
              box.y2 < area.y1 ||
              box.y1 > area.y2
            )
          ) {
            return area; // Return the overlapping area
          }
        }
        return null; // No overlap
      };

      // Function to find a suitable position for a label when it overlaps
      const findNonOverlappingPosition = (
        box: BoundingBox,
        centerX: number,
        centerY: number,
        origX: number,
        origY: number,
        attempts: number = 8
      ): { x: number; y: number } => {
        // First try keeping the original position if it doesn't overlap
        if (!wouldOverlap(box)) {
          return { x: origX, y: origY };
        }

        // Width and height of the box
        const width = box.x2 - box.x1;
        const height = box.y2 - box.y1;

        // Try different directions around the original position
        const directions = [
          { dx: 0, dy: -height * 1.2 }, // Top
          { dx: width * 1.2, dy: 0 }, // Right
          { dx: 0, dy: height * 1.2 }, // Bottom
          { dx: -width * 1.2, dy: 0 }, // Left
          { dx: width, dy: -height }, // Top-right
          { dx: width, dy: height }, // Bottom-right
          { dx: -width, dy: height }, // Bottom-left
          { dx: -width, dy: -height }, // Top-left
        ];

        // Try each direction until we find a non-overlapping position
        for (let i = 0; i < Math.min(attempts, directions.length); i++) {
          const dx = directions[i].dx;
          const dy = directions[i].dy;

          const newX = origX + dx;
          const newY = origY + dy;

          const newBox = {
            x1: box.x1 + dx,
            y1: box.y1 + dy,
            x2: box.x2 + dx,
            y2: box.y2 + dy,
            priority: box.priority,
            node: box.node,
          };

          if (!wouldOverlap(newBox)) {
            return { x: newX, y: newY };
          }
        }

        // If all attempts fail, return the original position
        return { x: origX, y: origY };
      };

      // Draw links first (they should be at the back)
      const link = linksGroup
        .selectAll(".link")
        .data(links)
        .enter()
        .append("g")
        .attr("class", "link");

      // Add link paths
      link
        .append("path")
        .attr("d", (d) => d.path || "")
        .attr("fill", "none")
        .attr("stroke", (d) => {
          if (d.value > colorConfig.thresholds.critical)
            return colorConfig.thresholds.criticalColor;
          if (d.value > colorConfig.thresholds.warning)
            return colorConfig.thresholds.warningColor;
          return colorConfig.links.base;
        })
        .attr("stroke-width", (d) => Math.max(1, Math.sqrt(d.value)))
        .attr("stroke-opacity", colorConfig.links.defaultOpacity)
        .on("mouseover", function () {
          d3.select(this).attr(
            "stroke-opacity",
            colorConfig.links.hoverOpacity
          );
        })
        .on("mouseout", function () {
          d3.select(this).attr(
            "stroke-opacity",
            colorConfig.links.defaultOpacity
          );
        });

      // Register nodes in the occupied areas for collision detection
      nodes.forEach((node) => {
        if (
          node.x0 === undefined ||
          node.y0 === undefined ||
          node.x1 === undefined ||
          node.y1 === undefined
        )
          return;

        // Add each node to occupied areas with high priority
        occupiedAreas.push({
          x1: node.x0,
          y1: node.y0,
          x2: node.x1,
          y2: node.y1,
          node: node.name,
          priority: 10, // Nodes have high priority
        });
      });

      // Add link value labels only if links exist and aren't too small
      if (links.length > 0) {
        link
          .filter((d) => d.value > 3) // Only show labels for larger links
          .append("g")
          .attr("class", "link-label-group")
          .each(function (d) {
            try {
              const path = d3
                .select(this.parentNode as Element)
                .select("path")
                .node() as SVGPathElement;

              if (!path) return;

              // Position label in the middle of the path
              const length = path.getTotalLength();
              if (length === 0) return; // Skip zero-length paths

              const midPoint = path.getPointAtLength(length / 2);

              // Generate a stable ID for this link
              const linkId = `link-${d.source}-${d.target}`;

              // Create label group at the midpoint initially or use the stored override
              const g = d3.select(this);

              // Check if we have a stored position for this link label
              const storedPosition = linkLabelOverrides.get(linkId);

              if (storedPosition) {
                // Use the stored position
                g.attr(
                  "transform",
                  `translate(${storedPosition.x}, ${storedPosition.y})`
                );
              } else {
                // Use the midpoint as default position
                g.attr("transform", `translate(${midPoint.x}, ${midPoint.y})`);
              }

              // Add background
              g.append("rect")
                .attr("class", "link-label-background")
                .attr("fill", "white")
                .attr("rx", 2)
                .attr("ry", 2);

              // Add text
              g.append("text")
                .attr("class", "link-label")
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "10px")
                .text(d.value.toFixed(1));

              // Add dragging capability to link labels
              g.style("cursor", "move").style("pointer-events", "all");

              // Create drag behavior for link labels
              const dragHandler = d3
                .drag()
                .on("start", function (event) {
                  window.updateDebugStatus?.(`Drag started: link ${linkId}`);
                  d3.select(this).raise().classed("dragging", true);
                })
                .on("drag", function (event) {
                  // Get current transform if any
                  const transform = d3.select(this).attr("transform") || "";
                  const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(
                    transform
                  );

                  if (!match) return; // Safety check

                  // Get the current position from the transform
                  const currentX = parseFloat(match[1]);
                  const currentY = parseFloat(match[2]);

                  // Calculate new position by adding the drag delta
                  const newX = currentX + event.dx;
                  const newY = currentY + event.dy;

                  // Apply the new transform
                  d3.select(this)
                    .attr("transform", `translate(${newX}, ${newY})`)
                    .classed("dragged", true);

                  // Get the current SVG parent
                  const domNode = d3.select(this).node() as SVGElement;
                  const svgParent = d3.select(domNode.ownerSVGElement);

                  // Remove all connector lines with this link ID to avoid duplicates
                  svgParent
                    .selectAll(`.link-label-connector[data-link="${linkId}"]`)
                    .remove();

                  // Add leader line from midpoint to the dragged label
                  svgParent
                    .append("path")
                    .attr("class", "link-label-connector")
                    .attr("data-link", linkId)
                    .attr("d", `M${midPoint.x},${midPoint.y} L${newX},${newY}`)
                    .attr("fill", "none");
                })
                .on("end", function (event) {
                  window.updateDebugStatus?.(`Drag ended: link ${linkId}`);

                  // Get final position
                  const transform = d3.select(this).attr("transform");
                  const match = transform
                    ? /translate\(([^,]+),\s*([^)]+)\)/.exec(transform)
                    : null;

                  if (match) {
                    const finalX = parseFloat(match[1]);
                    const finalY = parseFloat(match[2]);

                    // Store the new position in the link label overrides
                    const newOverrides = new Map(linkLabelOverrides);
                    newOverrides.set(linkId, { x: finalX, y: finalY });
                    setLinkLabelOverrides(newOverrides);
                  }

                  d3.select(this).classed("dragging", false);
                });

              // Apply drag behavior
              // @ts-ignore
              d3.select(g.node()).call(dragHandler);

              // Adjust background size
              const text = g.select("text").node() as SVGTextElement;
              if (text) {
                const bbox = text.getBBox();
                g.select("rect")
                  .attr("x", bbox.x - 3)
                  .attr("y", bbox.y - 2)
                  .attr("width", bbox.width + 6)
                  .attr("height", bbox.height + 4);

                // Only check for collision if we don't already have a stored position
                if (!storedPosition) {
                  // Check for collision with nodes
                  const transform = g.attr("transform");
                  const translateMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(
                    transform
                  );

                  if (translateMatch) {
                    const labelX = parseFloat(translateMatch[1]);
                    const labelY = parseFloat(translateMatch[2]);

                    const labelBox: BoundingBox = {
                      x1: labelX + bbox.x - 3,
                      y1: labelY + bbox.y - 2,
                      x2: labelX + bbox.x + bbox.width + 3,
                      y2: labelY + bbox.y + bbox.height + 2,
                      node: linkId,
                      priority: 5, // Links have lower priority than nodes
                    };

                    // Check if label overlaps with any node
                    const overlapping = wouldOverlap(labelBox);

                    if (overlapping) {
                      // Find a better position for the label
                      const newPos = findNonOverlappingPosition(
                        labelBox,
                        midPoint.x,
                        midPoint.y,
                        midPoint.x,
                        midPoint.y
                      );

                      // Update the label position
                      g.attr(
                        "transform",
                        `translate(${newPos.x}, ${newPos.y})`
                      );

                      // Store this position in the overrides map so it stays consistent across frames
                      const newOverrides = new Map(linkLabelOverrides);
                      newOverrides.set(linkId, { x: newPos.x, y: newPos.y });
                      setLinkLabelOverrides(newOverrides);

                      // Add a leader line from the midpoint to the new label position
                      const svgEl = d3.select(this.ownerSVGElement);
                      svgEl
                        .append("path")
                        .attr("class", "link-label-connector")
                        .attr("data-link", linkId)
                        .attr(
                          "d",
                          `M${midPoint.x},${midPoint.y} L${newPos.x},${newPos.y}`
                        )
                        .attr("fill", "none");
                    } else {
                      // If no collision, still store the midpoint position for consistency
                      const newOverrides = new Map(linkLabelOverrides);
                      newOverrides.set(linkId, { x: labelX, y: labelY });
                      setLinkLabelOverrides(newOverrides);
                    }
                  }
                } else {
                  // If we're using a stored position, add the connector line
                  const svgEl = d3.select(this.ownerSVGElement);
                  svgEl
                    .append("path")
                    .attr("class", "link-label-connector")
                    .attr("data-link", linkId)
                    .attr(
                      "d",
                      `M${midPoint.x},${midPoint.y} L${storedPosition.x},${storedPosition.y}`
                    )
                    .attr("fill", "none");
                }

                // Register this label's position in occupiedAreas for future labels
                const finalTransform = g.attr("transform");
                const finalMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(
                  finalTransform
                );

                if (finalMatch) {
                  const finalX = parseFloat(finalMatch[1]);
                  const finalY = parseFloat(finalMatch[2]);

                  occupiedAreas.push({
                    x1: finalX + bbox.x - 3,
                    y1: finalY + bbox.y - 2,
                    x2: finalX + bbox.x + bbox.width + 3,
                    y2: finalY + bbox.y + bbox.height + 2,
                    node: linkId,
                    priority: 5,
                  });
                }
              }
            } catch (error) {
              console.warn("Error creating link label:", error);
            }
          });
      }

      // Draw nodes
      const node = nodesGroup
        .selectAll(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d) => `translate(${d.x0}, ${d.y0})`);

      node
        .append("rect")
        .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
        .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0))
        .attr(
          "fill",
          (d) => colorConfig.nodes[d.depthCategory || "intermediate"]
        )
        .on("mouseover", function () {
          d3.select(this).attr("fill", colorConfig.nodes.hover);
        })
        .on("mouseout", function (_, d) {
          d3.select(this).attr(
            "fill",
            colorConfig.nodes[d.depthCategory || "intermediate"]
          );
        });

      // Add node labels with drag behavior
      const nodeLabelGroups = nodeLabelsGroup
        .selectAll(".node-label-group")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node-label-group")
        .attr("data-node-type", (d) => d.depthCategory || "intermediate")
        .attr("data-node-name", (d) => d.name)
        .style("cursor", "move") // Explicitly set cursor style
        .style("pointer-events", "all") // Ensure they capture events
        .each(function (d: any) {
          const g = d3.select(this);

          // We need to cast d to Node since TypeScript doesn't know the data type in this context
          const node = d as Node;

          // Calculate base position
          const width = (node.x1 || 0) - (node.x0 || 0);
          const height = (node.y1 || 0) - (node.y0 || 0);
          const x = (node.x0 || 0) + width / 2;
          const y = (node.y0 || 0) + height / 2;

          // Store original position without overrides
          g.attr("data-initial-x", x.toString()).attr(
            "data-initial-y",
            y.toString()
          );

          // Apply override if exists
          const nodeId = getNodeId(node);
          const override = labelOverrides.get(nodeId);

          // Set the initial transform to place the label at the node's center
          let translateX = x;
          let translateY = y;

          // Apply override if exists
          if (override) {
            translateX += override.dx;
            translateY += override.dy;
          }

          // Set absolute position using transform
          g.attr("transform", `translate(${translateX}, ${translateY})`);

          // Add label background
          g.append("rect")
            .attr("class", "node-label-background")
            .attr("rx", 3)
            .attr("ry", 3)
            .style("pointer-events", "all");

          // Add label text - position at the original coordinates
          // Since we'll be using a transform on the group
          g.append("text")
            .attr("class", "node-label")
            .attr("x", 0) // Set to 0 since we'll use the group's transform
            .attr("y", 0) // Set to 0 since we'll use the group's transform
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("pointer-events", "none") // Make sure text doesn't block events
            .text(node.name);

          // Adjust background rect size based on text
          const textNode = g.select("text").node();
          if (textNode) {
            try {
              // Safe cast to SVGTextElement
              const bbox = (textNode as SVGTextElement).getBBox();

              // Position the background rectangle centered on the text
              g.select("rect")
                .attr("x", -bbox.width / 2 - 3)
                .attr("y", -bbox.height / 2 - 2)
                .attr("width", bbox.width + 6)
                .attr("height", bbox.height + 4);

              // Add leader line if needed
              const nodeCenterX = (node.x0 || 0) + width / 2;
              const nodeCenterY = (node.y0 || 0) + height / 2;

              // Get the transform to find absolute position
              const transform = g.attr("transform") || "";
              const transformMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(
                transform
              );
              if (!transformMatch) return;

              // Get absolute position of the label center
              const labelX = parseFloat(transformMatch[1]);
              const labelY = parseFloat(transformMatch[2]);

              // Calculate distance between node and label
              const distance = Math.sqrt(
                Math.pow(nodeCenterX - labelX, 2) +
                  Math.pow(nodeCenterY - labelY, 2)
              );

              if (distance > Math.min(width, height) * 0.2) {
                // Find the SVG parent element
                const domNode = d3.select(this).node() as SVGElement;
                const svgElement = domNode?.ownerSVGElement;

                // Remove any existing connectors for this node
                if (svgElement) {
                  const svgParent = d3.select(svgElement);
                  svgParent
                    .selectAll(`.label-connector[data-node="${node.name}"]`)
                    .remove();

                  // Draw the connector line from node center to label center
                  svgParent
                    .append("path")
                    .attr("class", "label-connector")
                    .attr("data-node", node.name)
                    .attr(
                      "d",
                      `M${nodeCenterX},${nodeCenterY} L${labelX},${labelY}`
                    )
                    .attr("stroke", "#ffffff")
                    .attr("stroke-width", 0.8)
                    .attr("stroke-dasharray", "3,3")
                    .attr("fill", "none")
                    .attr("pointer-events", "none");
                }
              }
            } catch (error) {
              console.warn("Error positioning label:", error);
            }
          }
        });

      // Apply drag behavior to node labels
      nodeLabelGroups.each(function (d: any) {
        const node = d as Node;
        const nodeId = getNodeId(node);
        const element = this;

        console.log("Setting up drag for node:", node.name);

        // Create drag behavior
        const dragHandler = d3
          .drag()
          .on("start", function (event) {
            console.log("Drag start:", node.name);
            window.updateDebugStatus?.(`Drag started: ${node.name}`);
            d3.select(this).raise().classed("dragging", true);
          })
          .on("drag", function (event) {
            // Get current transform if any
            const transform = d3.select(this).attr("transform") || "";
            const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(transform);

            if (!match) return; // Safety check

            // Get the current position from the transform
            const currentX = parseFloat(match[1]);
            const currentY = parseFloat(match[2]);

            // Calculate new position by adding the drag delta
            const newX = currentX + event.dx;
            const newY = currentY + event.dy;

            // Apply the new transform
            d3.select(this)
              .attr("transform", `translate(${newX}, ${newY})`)
              .classed("dragged", true);

            // Update debug status
            window.updateDebugStatus?.(
              `Dragging: ${node.name}, x=${newX.toFixed(0)}, y=${newY.toFixed(
                0
              )}`
            );

            // Get node dimensions and center
            const width = (node.x1 || 0) - (node.x0 || 0);
            const height = (node.y1 || 0) - (node.y0 || 0);
            const nodeX = (node.x0 || 0) + width / 2;
            const nodeY = (node.y0 || 0) + height / 2;

            // Calculate distance between node center and label center
            const dx = nodeX - newX;
            const dy = nodeY - newY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Get the current SVG parent
            const domNode = d3.select(this).node() as SVGElement;
            const svgParent = d3.select(domNode.ownerSVGElement);

            // Remove all connector lines with this node's name to avoid duplicates
            svgParent
              .selectAll(`.label-connector[data-node="${node.name}"]`)
              .remove();

            // Add leader line if distance is above threshold
            const distanceThreshold = Math.min(width, height) * 0.2;
            if (distance > distanceThreshold) {
              // Draw the connector line in the SVG (not in the group)
              svgParent
                .append("path")
                .attr("class", "label-connector")
                .attr("data-node", node.name)
                .attr("d", `M${nodeX},${nodeY} L${newX},${newY}`)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 0.8)
                .attr("stroke-dasharray", "3,3")
                .attr("fill", "none")
                .attr("pointer-events", "none");
            }
          })
          .on("end", function (event) {
            console.log("Drag end:", node.name);
            window.updateDebugStatus?.(`Drag ended: ${node.name}`);

            // Get final position
            const transform = d3.select(this).attr("transform");
            const match = transform
              ? /translate\(([^,]+),\s*([^)]+)\)/.exec(transform)
              : null;

            if (match) {
              const finalX = parseFloat(match[1]);
              const finalY = parseFloat(match[2]);

              // Get the initial label position
              const initialX = parseFloat(
                d3.select(this).attr("data-initial-x") || "0"
              );
              const initialY = parseFloat(
                d3.select(this).attr("data-initial-y") || "0"
              );

              // Calculate the offset from initial position
              const dx = finalX - initialX;
              const dy = finalY - initialY;

              // Store the override
              const newOverrides = new Map(labelOverrides);
              newOverrides.set(nodeId, { dx, dy });
              setLabelOverrides(newOverrides);

              // Get node dimensions and center
              const width = (node.x1 || 0) - (node.x0 || 0);
              const height = (node.y1 || 0) - (node.y0 || 0);
              const nodeX = (node.x0 || 0) + width / 2;
              const nodeY = (node.y0 || 0) + height / 2;

              // Calculate distance to determine if connector is needed
              const distance = Math.sqrt(
                Math.pow(nodeX - finalX, 2) + Math.pow(nodeY - finalY, 2)
              );

              // Get the current SVG parent
              const domNode = d3.select(this).node() as SVGElement;
              const svgParent = d3.select(domNode.ownerSVGElement);

              // Remove all connector lines with this node's name
              svgParent
                .selectAll(`.label-connector[data-node="${node.name}"]`)
                .remove();

              // Add connector line if needed
              const distanceThreshold = Math.min(width, height) * 0.2;
              if (distance > distanceThreshold) {
                svgParent
                  .append("path")
                  .attr("class", "label-connector")
                  .attr("data-node", node.name)
                  .attr("d", `M${nodeX},${nodeY} L${finalX},${finalY}`)
                  .attr("stroke", "#ffffff")
                  .attr("stroke-width", 0.8)
                  .attr("stroke-dasharray", "3,3")
                  .attr("fill", "none")
                  .attr("pointer-events", "none");
              }
            }

            d3.select(this).classed("dragging", false);
          });

        // Apply drag behavior
        // @ts-ignore
        d3.select(element).call(dragHandler);

        // Also add a click handler for debugging
        d3.select(element).on("click", function (event) {
          console.log("Click detected on node label:", node.name);
          window.updateDebugEvents?.(`Click: ${node.name}`);
          event.stopPropagation();
        });
      });

      // Add a cleanup function to remove the debug group when component unmounts
      return () => {
        // Clear references
        statusTextRef.current = null;
        eventTextRef.current = null;
      };
    } catch (err) {
      console.error("Error rendering Sankey diagram:", err);
      setError("Error rendering diagram");
    }
  }, [currentLayoutState, colorConfig, labelOverrides, linkLabelOverrides]); // Add labelOverrides and linkLabelOverrides as dependencies

  // Backward compatibility for single frame data
  useEffect(() => {
    if (!data || !data.nodes || !data.links || snapshots.length > 0) return;

    try {
      // Ensure the data has valid nodes and links
      if (data.nodes.length === 0) {
        setError("No nodes in data");
        return;
      }

      if (data.links.length === 0) {
        setError("No links in data");
        return;
      }

      // Validate links - all source and target nodes must exist
      const nodeNames = new Set(data.nodes.map((n) => n.name));
      const validLinks = data.links.filter((link) => {
        const sourceName =
          typeof link.source === "string"
            ? link.source
            : typeof link.source === "number"
            ? data.nodes[link.source]?.name
            : (link.source as Node).name;

        const targetName =
          typeof link.target === "string"
            ? link.target
            : typeof link.target === "number"
            ? data.nodes[link.target]?.name
            : (link.target as Node).name;

        return nodeNames.has(sourceName) && nodeNames.has(targetName);
      });

      if (validLinks.length === 0) {
        setError("No valid links in data");
        return;
      }

      // Convert single data object to frames format
      const singleFrame: FrameData = {
        timestamp: new Date().toISOString(),
        nodes: data.nodes.map((node) => ({ name: node.name })),
        links: validLinks.map((link) => ({
          source:
            typeof link.source === "string"
              ? link.source
              : typeof link.source === "number"
              ? data.nodes[link.source].name
              : (link.source as Node).name,
          target:
            typeof link.target === "string"
              ? link.target
              : typeof link.target === "number"
              ? data.nodes[link.target].name
              : (link.target as Node).name,
          value: link.value,
        })),
      };

      const states = computeLayout([singleFrame], width, height);
      if (states.length > 0) {
        setLayoutStates(states);
        setCurrentLayoutState(states[0]);
        setError(null);
      } else {
        setError("Failed to compute layout");
      }
    } catch (err) {
      console.error("Error processing single frame data:", err);
      setError("Error processing data");
    }
  }, [data, dimensions.width, dimensions.height]);

  // Add resize observer to update dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Apply minimum dimensions to ensure the diagram has enough space
        setDimensions({
          width: Math.max(width, 600),
          height: Math.max(height, 350), // Lower minimum height to allow more compact diagrams
        });
      }
    };

    // Initial update
    updateDimensions();

    // Update dimensions when window resizes
    window.addEventListener("resize", updateDimensions);

    // Create observer for resize events
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", updateDimensions);
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);

  // Remove the debug test element
  useEffect(() => {
    if (!svgRef.current) return;

    // Old debug test element code that created the "Drag me" text
    // This has been removed

    return () => {
      // No need to clean up anything specific
    };
  }, [svgRef.current]);

  // Add useEffect to handle localStorage persistence
  useEffect(() => {
    // Save label overrides to localStorage
    if (labelOverrides.size > 0 || linkLabelOverrides.size > 0) {
      try {
        // Convert Map to array of entries for storage
        const nodeOverridesArray = Array.from(labelOverrides.entries());
        const linkOverridesArray = Array.from(linkLabelOverrides.entries());

        localStorage.setItem(
          "flowturi-label-overrides",
          JSON.stringify({
            nodes: nodeOverridesArray,
            links: linkOverridesArray,
          })
        );
      } catch (err) {
        console.warn("Failed to save label overrides:", err);
      }
    }
  }, [labelOverrides, linkLabelOverrides]);

  // Add useEffect to load stored overrides
  useEffect(() => {
    try {
      const storedData = localStorage.getItem("flowturi-label-overrides");
      if (storedData) {
        const parsed = JSON.parse(storedData);

        // Restore node label overrides
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          const restoredNodeOverrides = new Map<NodeId, LabelOverride>(
            parsed.nodes.map(([key, value]: [string, LabelOverride]) => [
              key,
              value,
            ])
          );
          setLabelOverrides(restoredNodeOverrides);
        }

        // Restore link label overrides
        if (parsed.links && Array.isArray(parsed.links)) {
          const restoredLinkOverrides = new Map<
            string,
            { x: number; y: number }
          >(
            parsed.links.map(
              ([key, value]: [string, { x: number; y: number }]) => [key, value]
            )
          );
          setLinkLabelOverrides(restoredLinkOverrides);
        }
      }
    } catch (err) {
      console.warn("Failed to load saved label overrides:", err);
    }
  }, []);

  if (error) {
    return <p className="sankey-error">Error: {error}</p>;
  }

  if (
    (snapshots.length === 0 && (!data || !data.nodes || !data.links)) ||
    !currentLayoutState
  ) {
    return <p className="no-data">No data to display</p>;
  }

  return (
    <div
      ref={containerRef}
      className="sankey-container"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          overflow: "visible",
          padding: "10px", // Add padding to ensure button isn't clipped
        }}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="sankey-diagram"
      ></svg>
    </div>
  );
};

export default SankeyDiagram;
