#!/usr/bin/env node
/**
 * Synthetic Sankey Data Generator
 *
 * Usage:
 *   node utils/sankey-synthgen.js --format csv --sources "FTP,User" --intermediates "Pump,Reactor" --targets "S3,DB" --duration 3600 --interval 60 --output data.csv
 *   node utils/sankey-synthgen.js --format json --nodes "FTP,S3,DB,API" --duration 3600 --interval 60 --output data.json
 *
 * Options:
 *   --format         Output format: csv or json (default: csv)
 *   --nodes          Comma-separated node names (default: random set)
 *   --sources        Comma-separated source node names
 *   --intermediates  Comma-separated intermediate node names
 *   --targets        Comma-separated target node names
 *   --duration       Total duration in seconds (default: 3600)
 *   --interval       Time interval in seconds between data points (default: 60)
 *   --output         Output file path (default: stdout)
 *
 * If --sources, --intermediates, or --targets are not specified, nodes will be auto-assigned to these categories.
 */

import fs from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
};

const format = getArg("format", "csv");
const nodeNames = getArg("nodes", null);
const sourcesArg = getArg("sources", null);
const intermediatesArg = getArg("intermediates", null);
const targetsArg = getArg("targets", null);
const duration = parseInt(getArg("duration", "3600"), 10);
const interval = parseInt(getArg("interval", "60"), 10);
const output = getArg("output", null);

// Node assignment logic
let nodes;
let sources, intermediates, targets;
if (sourcesArg || intermediatesArg || targetsArg) {
  sources = sourcesArg
    ? sourcesArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  intermediates = intermediatesArg
    ? intermediatesArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  targets = targetsArg
    ? targetsArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  nodes = [...sources, ...intermediates, ...targets];
} else if (nodeNames) {
  nodes = nodeNames
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Auto-assign: 1/3 sources, 1/3 intermediates, 1/3 targets
  const n = nodes.length;
  const s = Math.max(1, Math.floor(n / 3));
  const t = Math.max(1, Math.floor(n / 3));
  const i = n - s - t;
  sources = nodes.slice(0, s);
  intermediates = nodes.slice(s, s + i);
  targets = nodes.slice(s + i);
} else {
  // Modern cloud environment defaults
  nodes = [
    "Client",
    "API Gateway",
    "Load Balancer",
    "App Server",
    "Cache",
    "Queue",
    "Database",
    "Blob Storage",
    "Analytics",
    "3rd Party API",
  ];
  // Auto-assign
  sources = ["Client", "API Gateway"];
  intermediates = ["Load Balancer", "App Server", "Cache", "Queue"];
  targets = ["Database", "Blob Storage", "Analytics", "3rd Party API"];
}

const startTime = Date.now();
const steps = Math.ceil(duration / interval);

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function generateLinks(sources, intermediates, targets) {
  const links = [];
  // Source -> Intermediate
  for (const source of sources) {
    const numTargets = randomInt(1, intermediates.length || targets.length);
    const chosenIntermediates =
      intermediates.length > 0
        ? shuffle(intermediates).slice(0, numTargets)
        : [];
    for (const intermediate of chosenIntermediates) {
      links.push({ source, target: intermediate, value: randomInt(10, 100) });
    }
    // Optionally allow direct Source -> Target
    if (
      targets.length > 0 &&
      (intermediates.length === 0 || Math.random() < 0.3)
    ) {
      const chosenTargets = shuffle(targets).slice(
        0,
        randomInt(1, targets.length)
      );
      for (const target of chosenTargets) {
        links.push({ source, target, value: randomInt(10, 100) });
      }
    }
  }
  // Intermediate -> Target
  for (const intermediate of intermediates) {
    if (targets.length === 0) continue;
    const numTargets = randomInt(1, targets.length);
    const chosenTargets = shuffle(targets).slice(0, numTargets);
    for (const target of chosenTargets) {
      links.push({ source: intermediate, target, value: randomInt(10, 100) });
    }
  }
  return links;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Data generation
if (format === "csv") {
  let csv = "timestamp,source,target,value\n";
  for (let i = 0; i < steps; i++) {
    const ts = startTime + i * interval * 1000;
    const timestamp = formatTimestamp(ts);
    const links = generateLinks(sources, intermediates, targets);
    for (const link of links) {
      csv += `${timestamp},${link.source},${link.target},${link.value}\n`;
    }
  }
  if (output) {
    fs.writeFileSync(output, csv, "utf8");
    console.log(`CSV data written to ${output}`);
  } else {
    process.stdout.write(csv);
  }
} else if (format === "json") {
  const jsonArr = [];
  for (let i = 0; i < steps; i++) {
    const ts = startTime + i * interval * 1000;
    const timestamp = formatTimestamp(ts);
    const links = generateLinks(sources, intermediates, targets);
    jsonArr.push({
      timestamp,
      nodes: nodes.map((name) => ({ name })),
      links,
    });
  }
  const jsonStr = JSON.stringify(jsonArr, null, 2);
  if (output) {
    fs.writeFileSync(output, jsonStr, "utf8");
    console.log(`JSON data written to ${output}`);
  } else {
    process.stdout.write(jsonStr + "\n");
  }
} else {
  console.error("Unknown format:", format);
  process.exit(1);
}
