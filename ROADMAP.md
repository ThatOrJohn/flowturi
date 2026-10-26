# Flowturi: Background and Roadmap

## 1. Project Overview

- **Name**: Flowturi
- **Repository**: https://github.com/ThatOrJohn/flowturi
- **Purpose**: A tool to visualize information flows using Sankey diagrams, supporting historical (storytelling, EDA) and real-time (monitoring, observability) modes.
- **Target Deliverables**:
  - Open-source library for Sankey diagram visualization.
  - (Future) Platform with managed infrastructure (e.g., cloud-hosted, premium connectors)?
- **Intended Users**: Data analysts, developers, DevOps engineers, support, business intelligence teams.

## 2. Current State

- **Tech Stack**:
  - Vite + React + TypeScript
- **Features Implemented**:
  - Historical mode: JSON/CSV upload, playback controls, keyboard shortcuts, built-in sample datasets.
  - Real-time mode: WebSocket streaming with auto-reconnect.
  - Hover tooltips and connected-link highlighting.
  - Draggable nodes and labels.
  - Light and dark themes.
  - Export to WebM video and PNG frames.

## 3. Development Environment

- Hardware: Apple Silicon Mac Mini (M1, 16GB RAM).
- OS: macOS Sequoia.
- Tools: Cursor, Node.js v22 (>= 20.19), npm, Git.
- Constraints: 16GB RAM, prefer lightweight frameworks.

## 4. Roadmap Wish List

### 4.1 Short-Term Goals (1-3 months)

- [x] Convert toy repo to a modern framework (e.g., Vite + React/Vue/Svelte, TypeScript optional).
- [x] Flowturi Studio interface (file upload, display/format Sankey animation).
- [x] Common video controls for historical mode (e.g., progress bar, playback speed).
- [x] Improve layout stability.
- [x] Basic interactivity: tooltips.
- [ ] Zoom and pan.
- [ ] Styling options for nodes and links.
- [ ] Implement modular data connectors:
  - [ ] Static: CSV, JSON.
  - [ ] Database: PostgreSQL, SQLite.

## 4.2 Medium-Term Goals

- [ ] Historical mode: database queries.
- [x] Real-time mode: Live WebSocket updates.
- [ ] Documentation and demos.

## 4.3 Long-Term Goals

- [ ] Platform: Hosted infra, premium connectors.
- [ ] Scalability for large datasets.
- [ ] Community plugins.
