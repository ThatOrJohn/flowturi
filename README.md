# Flowturi Studio

Flowturi Studio is a visualization tool for Sankey diagrams with both historical and real-time capabilities.

## Features

- Visualize energy or resource flows in a Sankey diagram
- Historical mode: upload and analyze JSON or CSV time-series data
- Real-time mode: connect to WebSocket streams for live data visualization
- Responsive design with light and dark themes
- Stable and consistent node positioning following design philosophy

## Getting Started

1. Install dependencies:

   ```
   npm install
   ```

2. Start the development server:

   ```
   npm run dev
   ```

3. Open your browser to the URL displayed in the terminal (typically http://localhost:5173)

## Using Historical Mode

1. Select "Historical" in the mode toggle at the top of the application
2. Upload a JSON or CSV file with time-series Sankey data
3. Use the playback controls to navigate through the data frames

## Using Real-Time Mode

1. Select "Real-Time" in the mode toggle at the top of the application
2. Enter the WebSocket URL of your data source in the WebSocket URL field
3. Click "Connect" to establish the WebSocket connection
4. The Sankey diagram will automatically update as new data arrives
5. Enable "Auto-reconnect" to automatically reconnect if the connection is lost

## Data Format

### Historical mode expects data in the following format:

```json
{
  "timestamp": "2023-05-10 15:30:00",
  "tick": 1,
  "nodes": [
    { "id": "Source1", "label": "Source 1" },
    { "id": "Target1", "label": "Target 1" }
  ],
  "links": [{ "source": "Source1", "target": "Target1", "value": 10 }]
}
```

```csv
timestamp,source,target,value
2025-05-10 00:00:00,Crude Tank,Desalter,456.7
2025-05-10 00:00:00,Desalter,Heater,277.04
```

### Expected Real-Time WebSocket Data Format

The WebSocket stream should send data in the following format:

```json
{
  "timestamp": "2023-05-10T15:30:00Z",
  "tick": 1,
  "nodes": [
    { "id": "Source1", "label": "Source 1" },
    { "id": "Target1", "label": "Target 1" }
  ],
  "links": [{ "source": "Source1", "target": "Target1", "value": 10 }]
}
```

## Development

Flowturi follows a specific design philosophy for Sankey diagrams which is documented in:

- `docs/sankey-philosophy.md`
- `docs/sankey-layout-strategy.md`

The real-time mode implementation follows the strategy outlined in these documents to ensure stability,
readability, and smooth transitions.

## License

MIT
