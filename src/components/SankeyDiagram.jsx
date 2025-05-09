import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
} from "d3-sankey";

const SankeyDiagram = ({ data }) => {
  const svgRef = useRef(null);
  const [nodeOrder, setNodeOrder] = useState(null);
  const [nodePositions, setNodePositions] = useState(null);

  const colorConfig = {
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
      source: nodeMap.get(link.source),
      target: nodeMap.get(link.target),
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
      const sankeyTemp = d3Sankey()
        .nodeWidth(20)
        .nodePadding(Math.max(10, 300 / data.nodes.length))
        .extent([
          [1, 1],
          [width - 1, height - 5],
        ])
        .nodeSort((a, b) =>
          nodeOrder ? nodeOrder.indexOf(a.name) - nodeOrder.indexOf(b.name) : 0
        )
        .nodeAlign(sankeyJustify);

      const tempData = sankeyTemp({
        nodes: nodes,
        links: processedLinks,
      });

      const positions = new Map(
        tempData.nodes.map((node) => [
          node.name,
          { y0: node.y0, height: node.y1 - node.y0 },
        ])
      );
      setNodePositions(positions);
    }

    // Apply fixed positions to nodes before layout
    if (nodePositions) {
      nodes.forEach((node) => {
        const pos = nodePositions.get(node.name);
        if (pos) {
          node.y0 = pos.y0;
          node.y1 = pos.y0 + pos.height;
        }
      });
    }

    const sankey = d3Sankey()
      .nodeWidth(20)
      .nodePadding(Math.max(10, 300 / data.nodes.length))
      .extent([
        [1, 1],
        [width - 1, height - 5],
      ])
      .nodeSort((a, b) =>
        nodeOrder ? nodeOrder.indexOf(a.name) - nodeOrder.indexOf(b.name) : 0
      )
      .nodeAlign(sankeyJustify);

    const sankeyData = sankey({
      nodes: nodes,
      links: processedLinks,
    });

    const { nodes: finalNodes, links } = sankeyData;

    // Assign node depths for coloring and debug categorization
    finalNodes.forEach((node) => {
      node.depthCategory =
        node.depth === 0
          ? "source"
          : node.sourceLinks.length === 0
          ? "sink"
          : "intermediate";
      console.log(
        `Node: ${node.name}, Depth: ${node.depth}, TargetLinks: ${node.targetLinks.length}, SourceLinks: ${node.sourceLinks.length}, Category: ${node.depthCategory}`
      );
    });

    // Update or create links
    const link = svg
      .selectAll(".link")
      .data(links, (d) => `${d.source.name}-${d.target.name}`);

    const linkEnter = link.enter().append("g").attr("class", "link");

    linkEnter
      .append("path")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke-width", (d) => Math.max(1, d.width))
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
      .attr("stroke-width", (d) => Math.max(1, d.width))
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
      .attr("display", (d) => (d.width < 5 ? "none" : "block"))
      .each(function (d) {
        const group = d3.select(this);
        const text = group.select(".link-label");
        const textNode = text.node();
        const hasText = textNode.textContent && d.width >= 5;
        group.attr("display", hasText ? "block" : "none");
        if (hasText) {
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
        const path = d3.select(this.parentNode).select("path").node();
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
    const node = svg.selectAll(".node").data(finalNodes, (d) => d.name);

    const nodeEnter = node.enter().append("g").attr("class", "node");

    nodeEnter
      .append("rect")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("fill", (d) => colorConfig.nodes[d.depthCategory])
      .on("mouseover", function () {
        d3.select(this).attr("fill", colorConfig.nodes.hover);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("fill", colorConfig.nodes[d.depthCategory]);
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
      const bbox = text.node().getBBox();
      const padding = 10;
      const backgroundPadding = 2;
      const totalLabelWidth = bbox.width + 2 * backgroundPadding;
      let labelX, labelY;

      if (d.depthCategory === "intermediate") {
        console.log(`Node ${d.name} categorized as intermediate`);
        text.attr("text-anchor", "middle");
        labelX = (d.x0 + d.x1) / 2;
        labelY = (d.y1 + d.y0) / 2;
      } else if (d.depthCategory === "source") {
        console.log(`Node ${d.name} categorized as source`);
        text.attr("text-anchor", "start");
        labelX = Math.max(padding, d.x0 + 5);
        labelY = (d.y1 + d.y0) / 2;
      } else {
        console.log(`Node ${d.name} categorized as sink`);
        text.attr("text-anchor", "end");
        labelX = Math.max(
          padding + totalLabelWidth,
          Math.min(width - padding, d.x1 - 5)
        );
        labelY = (d.y1 + d.y0) / 2;
      }

      group.attr("transform", `translate(${labelX}, ${labelY})`);
      group
        .select(".node-label-background")
        .attr("x", bbox.x - backgroundPadding)
        .attr("y", bbox.y - backgroundPadding)
        .attr("width", bbox.width + 2 * backgroundPadding)
        .attr("height", bbox.height + 2 * backgroundPadding);
    });

    nodeEnter.append("title").text((d) => `${d.name}\nValue: ${d.value || 0}`);

    nodeUpdate
      .select("rect")
      .transition()
      .duration(1000)
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("fill", (d) => colorConfig.nodes[d.depthCategory]);

    node.exit().transition().duration(1000).attr("opacity", 0).remove();
  }, [data, nodeOrder, nodePositions]);

  return !data || !data.nodes || !data.links ? (
    <p style={{ textAlign: "center" }}>No data to display</p>
  ) : (
    <svg ref={svgRef} width={800} height={600}></svg>
  );
};

export default SankeyDiagram;
