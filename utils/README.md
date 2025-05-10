# Utils Directory

This directory contains utility scripts for the Flowturi project.

## sankey-synthgen.js

`sankey-synthgen.js` is a Node.js script for generating synthetic data for animated Sankey diagrams. It supports both CSV and JSON output formats and allows you to control the structure of the generated flows.

### Usage

```sh
node utils/sankey-synthgen.js [options]
```

### Options

- `--format` Output format: `csv` or `json` (default: `csv`)
- `--nodes` Comma-separated node names (default: modern cloud stages)
- `--sources` Comma-separated source node names
- `--intermediates` Comma-separated intermediate node names
- `--targets` Comma-separated target node names
- `--duration` Total duration in seconds (default: `3600`)
- `--interval` Time interval in seconds between data points (default: `60`)
- `--output` Output file path (default: stdout)

If `--sources`, `--intermediates`, or `--targets` are not specified, nodes will be auto-assigned to these categories. If `--nodes` is not specified, the following modern cloud environment stages are used by default:

- **Sources:** `Client`, `API Gateway`
- **Intermediates:** `Load Balancer`, `App Server`, `Cache`, `Queue`
- **Targets:** `Database`, `Blob Storage`, `Analytics`, `3rd Party API`

### Example Commands

Generate CSV with default cloud stages:

```sh
node utils/sankey-synthgen.js --format csv --output data.csv
```

Generate JSON with custom nodes and auto-assignment:

```sh
node utils/sankey-synthgen.js --format json --nodes "A,B,C,D,E,F" --output data.json
```

Generate CSV with explicit categories:

```sh
node utils/sankey-synthgen.js --format csv --sources "Client" --intermediates "App Server,Cache" --targets "Database" --output data.csv
```

### Output Formats

**CSV:**

```
timestamp,source,target,value
2025-05-08 11:22:56,Client,App Server,45
```

**JSON:**

```json
[
  {
    "timestamp": "2025-05-08 11:22:56",
    "nodes": [{ "name": "Client" }, ...],
    "links": [{ "source": "Client", "target": "App Server", "value": 10 }, ...]
  },
  ...
]
```

---

## Adding More Utilities

Add documentation for any new scripts or utilities in this directory below this line.
