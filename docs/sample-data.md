# Sample Data

Flowturi ships with a few sample datasets so you can try Historical mode without preparing your own file.

## Using Sample Data

1. Open Flowturi in Historical mode
2. Find the **Sample Data** section below the file upload area
3. Click a dataset to load it into the visualization

Sample files go through the same parsing and validation as uploaded files.

## Available Datasets

- `cloud-compute-burst.json`: cloud infrastructure handling a compute burst
- `oil-refinery-flow.csv`: flows through an oil refinery process
- `fanout-fanin-test.csv`: fan-out and fan-in network patterns

## Adding a Dataset

1. Put your JSON or CSV file in `public/test-data/`
2. Add it to the `SAMPLE_DATASETS` array in `src/App.tsx`

To generate synthetic data, see [`utils/sankey-synthgen.js`](../utils/README.md).
