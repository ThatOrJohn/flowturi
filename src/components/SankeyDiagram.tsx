import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  SankeyLink,
} from "d3-sankey";

interface Node {
  name: string;
  value?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  depth?: number;
  depthCategory?: "source" | "intermediate" | "sink";
  sourceLinks?: Link[];
  targetLinks?: Link[];
}

interface Link {
  source: string | number;
  target: string | number;
  value: number;
  width?: number;
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
  data: SankeyData | null;
}

const SankeyDiagram: React.FC<SankeyDiagramProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodeOrder, setNodeOrder] = useState<string[] | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { y0: number; height: number }> | null>(null);

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

  useEffect(() => {
    if (!svgRef.current || !data || !data.nodes || !data.links) {
      console.log("SankeyDiagram: Skipping render - invalid data", data);
      return;
    }

    const svg = d3.select(svgRef.current);
    const width = 800;
    const height = 600;

    // Map node names to indices for d3-sankey
    const nodeMap = new Map(
      data.nodes.map((node, index) => [node.name, index])
    );
    const processedLinks = data.links.map((link) => ({
      source: nodeMap.get(link.source as string) ?? 0,
      target: nodeMap.get(link.target as string) ?? 0,
      value: link.value,
    }));

    // Validate links
    if (
      processedLinks.some(
        (link) => link.source === undefined || link.target === undefined
      )
    ) {
      console.error(
        "Invalid links: Some source or target nodes not found",
        processedLinks
      );
      return;
    }

    // Set fixed node order on first render
    if (!nodeOrder) {
      const initialOrder = data.nodes.map((node) => node.name).sort();
      setNodeOrder(initialOrder);
    }

    // Prepare nodes with fixed positions before running sankey
    const nodes = data.nodes.map((d) => ({ ...d }));
    if (!nodePositions) {
      const sankeyTemp = d3Sankey<Node, Link>()
        .nodeWidth(20)
        .nodePadding(Math.max(10, 300 / data.nodes.length))
        .extent([
          [1, 1],
          [width - 1, height - 5],
        ])
        .nodeSort((a: Node, b: Node) =>
          nodeOrder ? nodeOrder.indexOf(a.name) - nodeOrder.indexOf(b.name) : 0
        )
        .nodeAlign(sankeyJustify);

      const tempData = sankeyTemp({
        nodes: nodes,
        links: processedLinks as SankeyLink<Node, Link>[],
      });

      const positions = new Map<string, { y0: number; height: number }>(
        tempData.nodes.map((node: Node) => [
          node.name,
          { y0: node.y0 || 0, height: (node.y1 || 0) - (node.y0 || 0) },
        ])
      );
      setNodePositions(positions);
    }

    // Apply fixed positions to nodes before layout
    if (nodePositions) {
      nodes.forEach((node: Node) => {
        const pos = nodePositions.get(node.name);
        if (pos) {
          node.y0 = pos.y0;
          node.y1 = pos.y0 + pos.height;
        }
      });
    }

    const sankey = d3Sankey<Node, Link>()
      .nodeWidth(20)
      .nodePadding(Math.max(10, 300 / data.nodes.length))
      .extent([
        [1, 1],
        [width - 1, height - 5],
      ])
      .nodeSort((a: Node, b: Node) =>
        nodeOrder ? nodeOrder.indexOf(a.name) - nodeOrder.indexOf(b.name) : 0
      )
      .nodeAlign(sankeyJustify);

    const sankeyData = sankey({
      nodes: nodes,
      links: processedLinks as SankeyLink<Node, Link>[],
    });

    const { nodes: finalNodes, links } = sankeyData;

    // Assign node depths for coloring and debug categorization
    finalNodes.forEach((node: Node) => {
      node.depthCategory =
        node.depth === 0
          ? "source"
          : node.sourceLinks?.length === 0
          ? "sink"
          : "intermediate";
      console.log(
        `Node: ${node.name}, Depth: ${node.depth}, TargetLinks: ${node.targetLinks?.length}, SourceLinks: ${node.sourceLinks?.length}, Category: ${node.depthCategory}`
      );
    });

    // Update or create links
    const link = svg
      .selectAll<SVGGElement, Link>(".link")
      .data(links, (d: Link) => {
        const source = d.source as unknown as Node;
        const target = d.target as unknown as Node;
        return `${source.name}-${target.name}`;
      });

    const linkEnter = link.enter().append("g").attr("class", "link");

    linkEnter
      .append("path")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke-width", (d) => Math.max(1, d.width || 0))
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.value > colorConfig.thresholds.critical)
          return colorConfig.thresholds.criticalColor;
        if (d.value > colorConfig.thresholds.warning)
          return colorConfig.thresholds.warningColor;
        return colorConfig.links.base;
      })
      .attr("stroke-opacity", colorConfig.links.defaultOpacity)
      .on("mouseover", function () {
        d3.select(this).attr("stroke-opacity", colorConfig.links.hoverOpacity);
      })
      .on("mouseout", function () {
        d3.select(this).attr(
          "stroke-opacity",
          colorConfig.links.defaultOpacity
        );
      });

    // Add link labels with a background rect
    linkEnter
      .append("g")
      .attr("class", "link-label-group")
      .call((g) => {
        g.append("rect")
          .attr("class", "link-label-background")
          .attr("fill", "#ffffff")
          .attr("rx", 2)
          .attr("ry", 2);
        g.append("text")
          .attr("class", "link-label")
          .attr("dy", "0.35em")
          .attr("fill", "#212121")
          .attr("font-size", "10px")
          .attr("text-anchor", "middle");
      });

    const linkUpdate = link.merge(linkEnter);

    linkUpdate
      .select("path")
      .transition()
      .duration(1000)
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke-width", (d) => Math.max(1, d.width || 0))
      .attr("stroke", (d) => {
        if (d.value > colorConfig.thresholds.critical)
          return colorConfig.thresholds.criticalColor;
        if (d.value > colorConfig.thresholds.warning)
          return colorConfig.thresholds.warningColor;
        return colorConfig.links.base;
      })
      .attr("stroke-opacity", colorConfig.links.defaultOpacity);

    // Ensure all links have a label group
    linkUpdate.each(function () {
      const group = d3.select(this);
      if (!group.select(".link-label-group").node()) {
        group
          .append("g")
          .attr("class", "link-label-group")
          .call((g) => {
            g.append("rect")
              .attr("class", "link-label-background")
              .attr("fill", "#ffffff")
              .attr("rx", 2)
              .attr("ry", 2);
            g.append("text")
              .attr("class", "link-label")
              .attr("dy", "0.35em")
              .attr("fill", "#212121")
              .attr("font-size", "10px")
              .attr("text-anchor", "middle");
          });
      }
    });

    // Update link labels and their backgrounds
    linkUpdate.select(".link-label").text((d) => d.value.toFixed(1));

    // Update the background rect size and visibility for link labels
    linkUpdate
      .select(".link-label-group")
      .attr("display", (d) => ((d.width || 0) < 5 ? "none" : "block"))
      .each(function (d) {
        const group = d3.select(this);
        const text = group.select(".link-label");
        const textNode = text.node() as SVGTextElement;
        const hasText = textNode?.textContent && (d.width || 0) >= 5;
        group.attr("display", hasText ? "block" : "none");
        if (hasText && textNode) {
          const bbox = textNode.getBBox();
          group
            .select(".link-label-background")
            .attr("x", bbox.x - 2)
            .attr("y", bbox.y - 2)
            .attr("width", bbox.width + 4)
            .attr("height", bbox.height + 4);
        }
      });

    // Position the link label group with vertical offset to avoid node labels
    linkUpdate
      .select(".link-label-group")
      .transition()
      .duration(1000)
      .attr("transform", function (d) {
        const group = d3.select(this);
        const path = group.select(function() { return this.parentNode; }).select("path").node() as SVGPathElement;
        if (!path) return "translate(0,0)";
        const length = path.getTotalLength();
        let pos = length / 2;
        let midPoint = path.getPointAtLength(pos);
        midPoint.x = Math.max(20, Math.min(width - 20, midPoint.x));
        midPoint.y = Math.max(20, Math.min(height - 20, midPoint.y));
        const offset = -15;
        return `translate(${midPoint.x}, ${midPoint.y + offset})`;
      });

    link.exit().transition().duration(1000).attr("opacity", 0).remove();

    // Update or create nodes
    const node = svg.selectAll<SVGGElement, Node>(".node").data(finalNodes, (d) => d.name);

    const nodeEnter = node.enter().append("g").attr("class", "node");

    nodeEnter
      .append("rect")
      .attr("x", (d) => d.x0 || 0)
      .attr("y", (d) => d.y0 || 0)
      .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
      .attr("fill", (d) => colorConfig.nodes[d.depthCategory || "intermediate"])
      .on("mouseover", function () {
        d3.select(this).attr("fill", colorConfig.nodes.hover);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("fill", colorConfig.nodes[d.depthCategory || "intermediate"]);
      });

    // Add node labels with a background rect
    nodeEnter
      .append("g")
      .attr("class", "node-label-group")
      .call((g) => {
        g.append("rect")
          .attr("class", "node-label-background")
          .attr("fill", "#f0f0f0")
          .attr("rx", 2)
          .attr("ry", 2);
        g.append("text")
          .attr("class", "node-label")
          .attr("dy", "0.35em")
          .attr("fill", "#212121")
          .attr("font-size", "12px")
          .text((d) => d.name);
      });

    // Update node label positions and backgrounds
    const nodeUpdate = node.merge(nodeEnter);

    nodeUpdate.select(".node-label-group").each(function (d) {
      const group = d3.select(this);
      const text = group.select(".node-label");
      const textNode = text.node() as SVGTextElement;
      if (!textNode) return;
      const bbox = textNode.getBBox();
      const backgroundPadding = 2;
      let labelX, labelY, rectX;
      let anchor = "middle";

      if (d.depthCategory === "intermediate") {
        anchor = "middle";
        text.attr("text-anchor", "middle");
        labelX = ((d.x0 || 0) + (d.x1 || 0)) / 2;
        labelY = ((d.y1 || 0) + (d.y0 || 0)) / 2;
        rectX = -((bbox.width + 2 * backgroundPadding) / 2);
      } else if (d.depthCategory === "source") {
        anchor = "start";
        text.attr("text-anchor", "start");
        labelX = (d.x0 || 0) + 5;
        labelY = ((d.y1 || 0) + (d.y0 || 0)) / 2;
        rectX = 0;
      } else {
        anchor = "end";
        text.attr("text-anchor", "end");
        labelX = (d.x1 || 0) - 5;
        labelY = ((d.y1 || 0) + (d.y0 || 0)) / 2;
        rectX = -(bbox.width + 2 * backgroundPadding);
      }

      group.attr("transform", `translate(${labelX}, ${labelY})`);
      group
        .select(".node-label-background")
        .attr("x", rectX)
        .attr("y", -(bbox.height / 2) - backgroundPadding)
        .attr("width", bbox.width + 2 * backgroundPadding)
        .attr("height", bbox.height + 2 * backgroundPadding);
    });

    nodeEnter.append("title").text((d) => `${d.name}\nValue: ${d.value || 0}`);

    nodeUpdate
      .select("rect")
      .transition()
      .duration(1000)
      .attr("x", (d) => d.x0 || 0)
      .attr("y", (d) => d.y0 || 0)
      .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
      .attr("fill", (d) => colorConfig.nodes[d.depthCategory || "intermediate"]);

    node.exit().transition().duration(1000).attr("opacity", 0).remove();
  }, [data, nodeOrder, nodePositions]);

  return !data || !data.nodes || !data.links ? (
    <p style={{ textAlign: "center" }}>No data to display</p>
  ) : (
    <svg ref={svgRef} width={800} height={600}></svg>
  );
};

export default SankeyDiagram; 