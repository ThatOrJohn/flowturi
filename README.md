# Flowturi

## Dynamic Sankey Flow Visualizer

A live-updating, animated Sankey diagram built with D3.js and Vite — designed to be flexible for storytelling, monitoring, and exploratory data analysis.

## Features

- 🔄 Smooth animations between states
- 📈 Supports real-time or pre-recorded data
- 🎛️ Play/Pause/Replay controls
- 🧠 Auto-generates layout from input nodes and links
- 💡 No hardcoded structure — works with new or unknown nodes

## Demo

![Flowturi animation](assets/FlowturiDemo.gif)

## Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/ThatOrJohn/flowturi.git
cd flowturi
npm install
```

## Development

To start the development server:

```bash
npm run dev
```

This will start the Vite development server at http://localhost:5173.

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

To preview the production build:

```bash
npm run preview
```

## Data Format

Each frame should include:

```json
{
  "timestamp": "2025-05-08 11:22:56",
  "nodes": [{ "name": "Reactor" }, ...],
  "links": [{ "source": "Pump", "target": "Reactor", "value": 10 }, ...]
}
```

## License

MIT
