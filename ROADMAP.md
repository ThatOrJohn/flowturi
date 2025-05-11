# Flowturi: Background and Roadmap

## 1. Project Overview

- **Name**: Flowturi
- **Repository**: https://github.com/ThatOrJohn/flowturi
- **Purpose**: A tool to visualize information flows using Sankey diagrams, supporting historical (storytelling, EDA) and real-time (monitoring, observability) modes.
- **Target Deliverables**:
  - Open-source library for Sankey diagram visualization.
  - (Future) Platform with managed infrastructure (e.g., cloud-hosted, premium connectors).
- **Intended Users**: Data analysts, developers, DevOps engineers, support, business intelligence teams.

## 2. Current State

- **Tech Stack**:
  - Vite + React + TypeScript
- **Features Implemented**:
  - Basic Sankey diagram rendering (nodes and links).

## 3. Development Environment

- Hardware: Apple Silicon Mac Mini (M1, 16GB RAM).
- OS: macOS Sequoia.
- Tools: Cursor, Node.js v18, npm, Git.
- Constraints: 16GB RAM, prefer lightweight frameworks.

## 4. Roadmap Wish List

### 4.1 Short-Term Goals (1-3 months)

- Convert toy repo to a modern framework (e.g., Vite + React/Vue/Svelte, TypeScript optional).
- Flowturi Studio interface (file upload, display/format Sankey animation).
- Common video controls for historical mode (e.g., progress bar, playback speed).
- Improve layout stability.
- Basic interactivity (tooltips, zoom).
- Styling options for nodes and links.
- Implement modular data connectors:
  - Static: CSV, JSON.
  - Database: PostgreSQL, SQLite.
- Publish as @flowturi/core?

## 4.2 Medium-Term Goals

- Historical mode: database queries.
- Real-time mode: Live WebSocket updates.
- Documentation and demos.

## 4.3 Long-Term Goals

- Platform: Hosted infra, premium connectors.
- Scalability for large datasets.
- Community plugins.
