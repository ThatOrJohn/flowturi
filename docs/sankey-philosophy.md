# Sankey Diagram Philosophy

This document outlines the core principles and design values behind how Flowturi renders and animates Sankey diagrams. It serves as a guiding reference for any contributor or automated tool (LLM or otherwise) working on the system.

## Purpose

Flowturi’s Sankey diagrams aim to be more than just visualizations—they are time-aware, intuitive flows of energy, resources, or information. Whether viewing historical data or monitoring real-time systems, our diagrams should feel clear, stable, and predictable.

## Core Philosophies

### 1. **Stability over Surprise**

- Nodes should remain in consistent vertical positions and sizes unless absolutely necessary.
- Avoid unnecessary shifts and resizes between frames to preserve the viewer's mental model.
- This is especially important in historical mode where the entire dataset is available up front.

### 2. **Respect Viewer Cognition**

- Drastic changes in layout, size, or flow direction mid-animation are disorienting.
- Favor incremental, intuitive movement.

### 3. **Visual Balance**

- Nodes and links should feel proportionally scaled.
- Link thickness should be visually relevant to node size—but nodes shouldn’t dwarf their links.

### 4. **Anticipation & Retention**

- Historical mode should take advantage of full knowledge to pre-plan layout.
- Real-time mode may rely on heuristics or predictive layout smoothing.

### 5. **Decoupled Layout and Rendering**

- Layout calculations should be isolated and reusable.
- Rendering logic should trust layout data without reprocessing it.

## Design Targets

- **Historical Mode**: Favor precomputed stable layouts that change only when data significantly changes.
- **Real-Time Mode**: Favor smooth interpolation between known node/link states with prediction to reduce jitter.

## Inspirations

- Observable-style D3 transitions.
- Mental model retention principles from UX literature.
- Design stability practices in animation and motion design.

---

This document may evolve, but its intent is to capture our commitment to clarity, consistency, and quality in Flowturi’s Sankey diagrams.
