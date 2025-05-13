import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { computeLayout, LayoutState, FrameData } from "../layout/computeLayout";
import "./SankeyDiagram.css";

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
}

const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  data,
  snapshots = [],
  currentIndex = 0,
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

              const g = d3
                .select(this)
                .attr("transform", `translate(${midPoint.x}, ${midPoint.y})`);

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
                .attr("fill", "#212121")
                .attr("font-size", "10px")
                .text(d.value.toFixed(1));

              // Adjust background size
              const text = g.select("text").node() as SVGTextElement;
              if (text) {
                const bbox = text.getBBox();
                g.select("rect")
                  .attr("x", bbox.x - 2)
                  .attr("y", bbox.y - 2)
                  .attr("width", bbox.width + 4)
                  .attr("height", bbox.height + 4);
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

      // Add node labels (top layer - highest priority)
      nodeLabelsGroup
        .selectAll(".node-label")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node-label-group")
        .attr("data-node-type", (d) => d.depthCategory || "intermediate")
        .attr("data-node-name", (d) => d.name)
        .each(function (d) {
          try {
            const g = d3.select(this);
            const width = (d.x1 || 0) - (d.x0 || 0);
            const height = (d.y1 || 0) - (d.y0 || 0);

            if (width <= 0 || height <= 0) return; // Skip invalid dimensions

            let xOffset = 0;
            let x = 0;
            let y = 0;
            let textAnchor = "middle";

            // Position based on node type with larger offsets to avoid links and other nodes
            if (d.depthCategory === "source") {
              xOffset = 0; // Center horizontally over the node
              x = (d.x0 ?? 0) + width / 2;
              y = (d.y0 ?? 0) + height / 2; // Position in center of node
              textAnchor = "middle";
            } else if (d.depthCategory === "sink") {
              xOffset = 0; // Center horizontally over the node
              x = (d.x0 ?? 0) + width / 2;
              y = (d.y0 ?? 0) + height / 2; // Position in center of node
              textAnchor = "middle";
            } else {
              // For intermediate nodes, try multiple positions to find the best one
              // Create an array of possible positions to try in order of preference
              const possiblePositions = [
                {
                  x: (d.x0 ?? 0) + width / 2,
                  y: (d.y0 ?? 0) + height / 2, // Center first
                  anchor: "middle",
                  position: "center", // Center on node
                },
                {
                  x: (d.x0 ?? 0) + width / 2,
                  y: (d.y0 ?? 0) - 5, // Slightly above
                  anchor: "middle",
                  position: "above", // Above node
                },
                {
                  x: (d.x0 ?? 0) + width / 2,
                  y: (d.y1 ?? 0) + 5, // Slightly below
                  anchor: "middle",
                  position: "below", // Below node
                },
                {
                  x: (d.x1 ?? 0) + 5,
                  y: (d.y0 ?? 0) + height / 2,
                  anchor: "start",
                  position: "right", // Right of node
                },
                {
                  x: (d.x0 ?? 0) - 5,
                  y: (d.y0 ?? 0) + height / 2,
                  anchor: "end",
                  position: "left", // Left of node
                },
              ];

              // Create temporary text element to measure its size
              const tempText = g
                .append("text")
                .attr("font-size", "12px")
                .text(d.name);

              const bbox = tempText.node()?.getBBox() || {
                x: 0,
                y: 0,
                width: 50,
                height: 14,
              };
              tempText.remove();

              // Calculate label dimensions with padding
              const boxWidth = bbox.width + 6;
              const boxHeight = bbox.height + 4;

              // Try each position until we find one that doesn't overlap
              let foundValidPosition = false;
              let bestPosition = null;

              // Check occupied areas array from outer scope
              for (const pos of possiblePositions) {
                // Calculate box position based on text anchor
                let boxX, boxY;

                if (pos.anchor === "end") {
                  boxX = pos.x - boxWidth;
                  boxY = pos.y - boxHeight / 2;
                } else if (pos.anchor === "start") {
                  boxX = pos.x;
                  boxY = pos.y - boxHeight / 2;
                } else {
                  // middle
                  boxX = pos.x - boxWidth / 2;
                  boxY = pos.y - boxHeight / 2;
                }

                // Create bounding box for collision testing
                const testBox = {
                  x1: boxX,
                  y1: boxY,
                  x2: boxX + boxWidth,
                  y2: boxY + boxHeight,
                  priority: 3, // Node labels have highest priority
                };

                // Check if position is within viewport boundaries
                const isWithinBounds =
                  boxX >= margin.left &&
                  boxX + boxWidth <= dimensions.width - margin.right &&
                  boxY >= margin.top &&
                  boxY + boxHeight <= dimensions.height - margin.bottom;

                // Check if this position overlaps with any existing boxes
                const overlap = wouldOverlap(testBox);

                if (isWithinBounds && !overlap) {
                  // Found a good position!
                  x = pos.x;
                  y = pos.y;
                  textAnchor = pos.anchor;
                  bestPosition = pos;
                  foundValidPosition = true;

                  // Add this box to occupied areas
                  occupiedAreas.push(testBox);
                  break;
                }
              }

              // If we couldn't find a non-overlapping position, use the first one
              // but add some additional offset to reduce overlap
              if (!foundValidPosition) {
                const firstPos = possiblePositions[0];
                x = firstPos.x;
                y = firstPos.y - (Math.random() * 6 - 3); // Add minimal vertical jitter
                textAnchor = firstPos.anchor;

                // Force add this box with high priority
                const forcedBox = {
                  x1: x - boxWidth / 2,
                  y1: y - boxHeight / 2,
                  x2: x + boxWidth / 2,
                  y2: y + boxHeight / 2,
                  priority: 4, // Extra high priority
                };

                occupiedAreas.push(forcedBox);
              }
            }

            // Add background first
            g.append("rect")
              .attr("class", "node-label-background")
              .attr("fill", "rgba(30, 30, 30, 0.85)")
              .attr("rx", 3)
              .attr("ry", 3)
              .attr("stroke", "rgba(255, 255, 255, 0.25)")
              .attr("stroke-width", 0.5);

            // Add text
            g.append("text")
              .attr("class", "node-label")
              .attr("x", x)
              .attr("y", y)
              .attr("dy", "0.35em")
              .attr("text-anchor", textAnchor)
              .attr("fill", "#ffffff")
              .attr("font-size", "12px")
              .text(d.name);

            // Adjust background size
            const text = g.select("text").node() as SVGTextElement;
            if (text) {
              const bbox = text.getBBox();
              const bgX =
                textAnchor === "start"
                  ? x
                  : textAnchor === "end"
                  ? x - bbox.width
                  : x - bbox.width / 2;

              g.select("rect")
                .attr("x", bgX - 2)
                .attr("y", bbox.y - 2)
                .attr("width", bbox.width + 4)
                .attr("height", bbox.height + 4);

              // Add connector line for labels positioned away from nodes
              // Calculate the distance between the label and the node center
              const nodeCenterX = (d.x0 ?? 0) + width / 2;
              const nodeCenterY = (d.y0 ?? 0) + height / 2;
              const labelCenterX = bgX + bbox.width / 2;
              const labelCenterY = bbox.y + bbox.height / 2;

              // Distance threshold - only draw connector if the label is far from the node
              const distanceThreshold = Math.min(width, height) * 0.2; // More conservative threshold
              const distance = Math.sqrt(
                Math.pow(nodeCenterX - labelCenterX, 2) +
                  Math.pow(nodeCenterY - labelCenterY, 2)
              );

              if (distance > distanceThreshold) {
                // Draw a subtle connector line
                g.append("path")
                  .attr("class", "label-connector")
                  .attr(
                    "d",
                    `M${nodeCenterX},${nodeCenterY} L${labelCenterX},${labelCenterY}`
                  )
                  .attr("stroke", "rgba(255, 255, 255, 0.2)")
                  .attr("stroke-width", 0.5)
                  .attr("stroke-dasharray", "1,1")
                  .attr("fill", "none");
              }
            }
          } catch (error) {
            console.warn("Error creating node label:", error);
          }
        });

      // Add hover titles
      node
        .append("title")
        .text((d) => `${d.name}\nLayer: ${d.layer}\nType: ${d.depthCategory}`);
    } catch (err) {
      console.error("Error rendering Sankey diagram:", err);
      setError("Error rendering diagram");
    }
  }, [currentLayoutState, colorConfig]);

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
        style={{ overflow: "visible" }}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="xMidYMid meet"
      ></svg>
    </div>
  );
};

export default SankeyDiagram;
