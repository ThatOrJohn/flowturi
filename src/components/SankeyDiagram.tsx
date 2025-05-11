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
  const [layoutStates, setLayoutStates] = useState<LayoutState[]>([]);
  const [currentLayoutState, setCurrentLayoutState] =
    useState<LayoutState | null>(null);
  const [colorScale, setColorScale] =
    useState<d3.ScaleOrdinal<string, string, never>>();
  const [error, setError] = useState<string | null>(null);

  const width = 800;
  const height = 600;
  const margin = { top: 0, right: 0, bottom: 0, left: 0 };

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

      const g = svg.append("g");

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

      // Draw links
      const link = g
        .selectAll(".link")
        .data(links)
        .enter()
        .append("g")
        .attr("class", "link");

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
      const node = g
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

      // Add node labels
      node
        .append("g")
        .attr("class", "node-label-group")
        .each(function (d) {
          try {
            const g = d3.select(this);
            const width = (d.x1 || 0) - (d.x0 || 0);
            const height = (d.y1 || 0) - (d.y0 || 0);

            if (width <= 0 || height <= 0) return; // Skip invalid dimensions

            let x = width / 2;
            let textAnchor = "middle";

            // Adjust position based on node type
            if (d.depthCategory === "source") {
              x = width + 5;
              textAnchor = "start";
            } else if (d.depthCategory === "sink") {
              x = -5;
              textAnchor = "end";
            }

            // Add background first
            g.append("rect")
              .attr("class", "node-label-background")
              .attr("fill", "#f0f0f0")
              .attr("rx", 2)
              .attr("ry", 2);

            // Add text
            g.append("text")
              .attr("class", "node-label")
              .attr("x", x)
              .attr("y", height / 2)
              .attr("dy", "0.35em")
              .attr("text-anchor", textAnchor)
              .attr("fill", "#212121")
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
  }, [data, width, height]);

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
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ overflow: "visible" }} // Allow content to overflow (for node labels that exceed bounds)
    ></svg>
  );
};

export default SankeyDiagram;
