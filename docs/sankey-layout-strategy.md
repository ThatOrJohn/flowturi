# Flowturi Sankey Layout Philosophy

Flowturi aims to present animated Sankey diagrams in two modes:

- **Historical Mode**: Pre-recorded data with known timestamps and volumes.
- **Real-time Mode**: Live-updating flows with new data arriving continuously.

This document outlines our layout philosophy and design principles for both modes.

---

## Goals for Both Modes

1. **Stability**: Node positions should not jitter or bounce without a clear reason.
2. **Readability**: Node sizes and link thicknesses should reflect relative volumes, without overwhelming the chart.
3. **Smooth Transitions**: Animations should be coherent and pleasant to watch.
4. **Performance**: Layout calculations must remain performant on common desktop systems (e.g., MacBook with 16 GB RAM).

---

## Historical Mode Philosophy

In historical mode, we know all the data in advance. This allows for preprocessing.

### Strategy

- **Precompute full layout**: Analyze the full time-series upfront to determine consistent node ordering and sizing.
- **Fixed vertical node ordering**: Lock node Y positions across frames.
- **Dynamic but constrained height scaling**: Allow node size changes if values fluctuate, but dampen large swings (e.g., apply a max change per frame).

### Preprocessing Steps (Pseudocode)

```ts
1. For all frames:
   - Collect all nodes and links.
   - Group nodes by their layer/depth (i.e., source-to-sink distance).

2. For each node:
   - Track max/min flow values across time.

3. Assign vertical positions:
   - For each layer, sort nodes by total throughput or heuristics.
   - Evenly space nodes vertically, accounting for max height.

4. Store a stable layout plan:
   layoutPlan = {
     nodes: [ { id, x, y, maxHeight }... ],
     links: [ { source, target }... ]
   }
```

### Example Layout Plan Output

```json
{
  "nodes": [
    { "id": "Tank A", "x": 0, "y": 100, "maxHeight": 50 },
    { "id": "Pump 1", "x": 1, "y": 200, "maxHeight": 60 },
    { "id": "Reactor", "x": 2, "y": 220, "maxHeight": 40 }
  ],
  "layers": 3
}
```

### Benefits

- Excellent stability and performance
- Frame-by-frame rendering is fast, since layout is precomputed

---

## Real-time Mode Philosophy

In real-time mode, data flows in live. We can't precompute everything, but we can still enforce stability.

### Strategy

- **Fixed node Y order**: Maintain vertical order by assigning each node a fixed Y-index when it first appears.
- **Sliding window smoothing**: Use a short window (e.g. 3–5 frames) to smooth out value and position transitions.
- **Minimize reshuffling**: Once a node has a spot, don't move it unless it becomes irrelevant for many frames.

### Additional Heuristics

- Merge nearby new nodes into gaps, or stack below low-volume flows.
- Consider decay functions for vanishing nodes, fading them out smoothly.

### Pseudocode (Live Frame Update)

```ts
for each new frame:
  1. Update volume data
  2. Smooth node sizes using exponential moving average
  3. Apply constraints from previous node Y-index
  4. Animate to new state with D3 transitions
```

---

## Layout Stability Diagram (ASCII example)

**Historical**

```
Layer 0       Layer 1         Layer 2
+-------+     +--------+      +---------+
| TankA | --> | Pump 1 | -->  | Reactor |
+-------+     +--------+      +---------+
               |                  |
               v                  v
           +--------+        +---------+
           |Bypass  |        | Tank B  |
           +--------+        +---------+
```

**Real-time**

```
Nodes appear as data arrives, but their Y order is preserved:

Frame 1:         Frame 5:
+------+         +------+       +------+
| A    |         | A    |  -->  | A    |
+------+         +------+       +------+
                      \             \
                       +------+      +------+
                       | New  |      | New  |
                       +------+      +------+
```

---

## File Size Considerations

Preprocessing cost is proportional to:

- **F × N × L**, where:

  - F = number of frames
  - N = number of nodes
  - L = number of links per frame

### Practical Limits

On a modern laptop with 16 GB RAM:

- 1,000–5,000 frames (e.g. 10–60 FPS playback over a few minutes)
- 50–200 nodes
- Should remain under 1 second for preprocessing with optimized JS

You can always chunk and cache preprocessing for huge datasets.

---

## Next Steps

- [ ] Add layout planner module (e.g., `planHistoricalLayout(data): LayoutPlan`)
- [ ] Animate layout transitions using layout plan
- [ ] Refine smoothing logic and adaptive frame scaling
