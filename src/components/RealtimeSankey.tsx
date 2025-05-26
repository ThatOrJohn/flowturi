import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { LayoutState, FrameData } from "../layout/computeLayout";
import { computeRealtimeLayout } from "../layout/computeRealtimeLayout";
import { addNodeDragBehavior } from "./NodeDragHandler";
import "./SankeyDiagram.css";

interface RealtimeSankeyProps {
  width?: number;
  height?: number;
  theme?: "light" | "dark";
  latestFrame?: FrameData | null;
}

// Add type for node depth category
type NodeDepthCategory = "source" | "intermediate" | "sink";

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

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const RealtimeSankey: React.FC<RealtimeSankeyProps> = ({
  width: propWidth = 800,
  height: propHeight = 600,
  theme = "light",
  latestFrame,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentLayoutState, setCurrentLayoutState] =
    useState<LayoutState | null>(null);
  const [dimensions, setDimensions] = useState({
    width: propWidth,
    height: propHeight,
  });
  const [error, setError] = useState<string | null>(null);
  const [customPositions, setCustomPositions] = useState<{
    [nodeName: string]: { x: number; y: number };
  }>({});

  // Create cache for smoothing between frames
  const smoothingCacheRef = useRef<any>(null);

  // Create color scale
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

  // Add resize observer to update dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Apply minimum dimensions to ensure the diagram has enough space
        setDimensions({
          width: Math.max(width, 600),
          height: Math.max(height, 350), // Lower minimum height for compact diagrams
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

  // Layout margins for positioning
  const margins = {
    top: 20,
    right: 20,
    bottom: 20,
    left: 20,
  };

  // Process new frame data when it arrives
  useEffect(() => {
    if (!latestFrame) return;

    console.log("RealtimeSankey received new frame:", {
      timestamp: latestFrame.timestamp,
      tick: latestFrame.tick,
      nodes: latestFrame.nodes.length,
      links: latestFrame.links.length,
      nodeNames: latestFrame.nodes.map((n) => n.name),
      linkPairs: latestFrame.links.map((l) => `${l.source}->${l.target}`),
    });

    try {
      // Compute real-time layout with custom positions
      const { layoutState, smoothingCache } = computeRealtimeLayout(
        latestFrame,
        currentLayoutState,
        smoothingCacheRef.current,
        dimensions.width,
        dimensions.height,
        customPositions
      );

      // Update cache for next frame
      smoothingCacheRef.current = smoothingCache;

      // Verify layout state has valid data
      if (
        !layoutState.nodePositions ||
        Object.keys(layoutState.nodePositions).length === 0
      ) {
        console.error("Layout state has no nodes");
        return;
      }

      if (!layoutState.linkPaths || layoutState.linkPaths.length === 0) {
        console.error("Layout state has no links");
        return;
      }

      console.log("Computed layout state:", {
        nodes: Object.keys(layoutState.nodePositions).length,
        links: layoutState.linkPaths.length,
      });

      // Update state with new layout
      setCurrentLayoutState(layoutState);
      setError(null);
    } catch (err) {
      console.error("Error computing real-time layout:", err);
      setError("Error in layout computation");
    }
  }, [latestFrame, dimensions.width, dimensions.height, customPositions]);

  // Render the chart using the current layout state
  useEffect(() => {
    if (!svgRef.current || !currentLayoutState) return;

    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove(); // Clear previous rendering

      // Create layered groups for proper z-index ordering
      const baseGroup = svg.append("g");

      // Position correctly without negative transform
      baseGroup.attr("transform", `translate(0, 0)`);

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

      const nodes = nodeNames.map((name) => {
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
        return;
      }

      const links = currentLayoutState.linkPaths.map((path) => {
        return {
          source: nodes.find((n) => n.name === path.source),
          target: nodes.find((n) => n.name === path.target),
          value: path.value,
          path: path.path,
        };
      });

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
          (d) =>
            colorConfig.nodes[
              (d.depthCategory as NodeDepthCategory) || "intermediate"
            ]
        )
        .on("mouseover", function () {
          d3.select(this).attr("fill", colorConfig.nodes.hover);
        })
        .on("mouseout", function (_, d) {
          d3.select(this).attr(
            "fill",
            colorConfig.nodes[
              (d.depthCategory as NodeDepthCategory) || "intermediate"
            ]
          );
        });

      // Add node drag behavior
      if (latestFrame) {
        addNodeDragBehavior(node as any, [latestFrame], (updatedFrames) => {
          if (updatedFrames.length > 0) {
            const frame = updatedFrames[0];
            const newCustomPositions = { ...customPositions };

            frame.nodes.forEach((node) => {
              if (node.customX !== undefined && node.customY !== undefined) {
                newCustomPositions[node.name] = {
                  x: node.customX,
                  y: node.customY,
                };
              }
            });

            setCustomPositions(newCustomPositions);
          }
        });
      }

      // Add node labels with styled backgrounds
      const nodeLabelGroups = nodeLabelsGroup
        .selectAll(".node-label-group")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node-label-group")
        .attr("data-node-type", (d) => d.depthCategory)
        .attr("data-specific-node", (d) => d.name);

      // Add background rectangle for node labels
      nodeLabelGroups
        .append("rect")
        .attr("class", "node-label-background")
        .attr("x", (d) => (d.x0 || 0) + ((d.x1 || 0) - (d.x0 || 0)) / 2)
        .attr("y", (d) => (d.y0 || 0) + ((d.y1 || 0) - (d.y0 || 0)) / 2)
        .attr("width", 10) // Will be updated after text is added
        .attr("height", 10)
        .attr("transform", "translate(-5, -5)"); // Initially centered

      // Add text for node labels
      nodeLabelGroups
        .append("text")
        .attr("class", "node-label")
        .attr("x", (d) => (d.x0 || 0) + ((d.x1 || 0) - (d.x0 || 0)) / 2)
        .attr("y", (d) => (d.y0 || 0) + ((d.y1 || 0) - (d.y0 || 0)) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text((d) => d.name)
        .attr("font-size", (d) => {
          const nodeWidth = (d.x1 || 0) - (d.x0 || 0);
          const nodeHeight = (d.y1 || 0) - (d.y0 || 0);
          const fontSize = Math.min(
            14, // max font size
            Math.min(nodeWidth * 0.8, nodeHeight * 0.5) /
              Math.max(1, d.name.length / 2)
          );
          return `${Math.max(8, fontSize)}px`; // Minimum 8px font size
        })
        .attr("fill", theme === "dark" ? "#fff" : "#000")
        .each(function (d) {
          // Get the text element's bounding box
          const bbox = (this as SVGTextElement).getBBox();

          // Update the background rectangle to match text dimensions
          const padding = 4;
          const parent = d3.select(this.parentNode as SVGGElement);

          parent
            .select("rect.node-label-background")
            .attr("width", bbox.width + padding * 2)
            .attr("height", bbox.height + padding * 2)
            .attr(
              "transform",
              `translate(${-bbox.width / 2 - padding}, ${
                -bbox.height / 2 - padding
              })`
            );

          // Add bounding box for overlap detection
          const boundingBox: BoundingBox = {
            x1: bbox.x - padding,
            y1: bbox.y - padding,
            x2: bbox.x + bbox.width + padding,
            y2: bbox.y + bbox.height + padding,
          };

          occupiedAreas.push(boundingBox);
        });

      // Add link labels
      const linkLabelGroups = linkLabelsGroup
        .selectAll(".link-label-group")
        .data(links)
        .enter()
        .append("g")
        .attr("class", "link-label-group");

      // Add background rectangle for link labels
      linkLabelGroups.append("rect").attr("class", "link-label-background");

      // Add text for link labels
      linkLabelGroups
        .append("text")
        .attr("class", "link-label")
        .text((d) => {
          const value = d.value !== undefined ? d.value : 0;
          return value.toFixed(1);
        })
        .each(function (d) {
          // Skip if we can't determine the path
          if (!d.path) return;

          // Find the midpoint of the path to place the label
          const pathNode = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );
          pathNode.setAttribute("d", d.path);
          const pathLength = pathNode.getTotalLength();
          const midPoint = pathNode.getPointAtLength(pathLength / 2);

          // Position the text at the midpoint
          d3.select(this)
            .attr("x", midPoint.x)
            .attr("y", midPoint.y)
            .attr("dy", "-0.5em") // Position slightly above the path
            .attr("text-anchor", "middle")
            .attr("fill", theme === "dark" ? "#fff" : "#000");

          // Get the text element's bounding box
          const bbox = (this as SVGTextElement).getBBox();

          // Update the background rectangle to match text dimensions
          const padding = 3;
          const parent = d3.select(this.parentNode as SVGGElement);

          parent
            .select("rect.link-label-background")
            .attr("x", bbox.x - padding)
            .attr("y", bbox.y - padding)
            .attr("width", bbox.width + padding * 2)
            .attr("height", bbox.height + padding * 2)
            .attr("rx", 3)
            .attr("ry", 3);
        });

      // Add hover titles to links
      link
        .append("title")
        .text(
          (d) =>
            `${d.source?.name} → ${d.target?.name}: ${
              d.value?.toFixed(1) || "N/A"
            }`
        );

      // Add hover titles to nodes
      node
        .append("title")
        .text((d) => `${d.name}\nLayer: ${d.layer}\nType: ${d.depthCategory}`);
    } catch (err) {
      console.error("Error rendering Sankey diagram:", err);
      setError("Error rendering diagram");
    }
  }, [currentLayoutState, theme, customPositions]);

  if (error) {
    return <p className="sankey-error">Error: {error}</p>;
  }

  if (!currentLayoutState) {
    return <p className="no-data">Waiting for data stream...</p>;
  }

  return (
    <div
      ref={containerRef}
      className="sankey-container"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          display: "block",
          overflow: "hidden",
          margin: "0 auto",
          maxHeight: "100%",
        }}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="sankey-diagram"
      ></svg>
    </div>
  );
};

export default RealtimeSankey;
