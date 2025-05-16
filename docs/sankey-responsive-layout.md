## 🛠 Implementation Plan: Responsive Sankey Layout in Flowturi Studio

### 🌟 **Goal**

Refactor the layout and CSS of the Sankey view so that:

- The Sankey diagram dynamically fills the vertical space between the top header and the bottom file controls.
- There’s no overlap or fixed dimensions that cause layout issues.
- The SVG resizes properly with the container.

---

### 🧹 1. **Restructure Layout with Flexbox**

#### ✅ Apply Flex to Root Containers

Ensure that the app root and main layout containers are flex-based and occupy full height:

```css
/* global.css or equivalent */
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}
```

```css
.App {
  display: flex;
  flex-direction: column;
  height: 100%;
}
```

---

### 🧱 2. **Update `.sankey-view-container` to Fill Remaining Space**

```css
.sankey-view-container {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  overflow: hidden;
}
```

This ensures that the Sankey container takes up **remaining space** between the header and bottom panels.

---

### 🎨 3. **Make `.sankey-container` Fully Flexible**

```css
.sankey-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
```

The key is `flex: 1` so that the SVG can fill vertical space.

---

### 🗾 4. **Update SVG Rendering**

In the Sankey-rendering React component, ensure the SVG is responsive:

```tsx
<svg
  viewBox="0 0 800 600"
  preserveAspectRatio="xMidYMid meet"
  style={{ width: "100%", height: "100%", display: "block" }}
>
  {/* Sankey contents */}
</svg>
```

If D3 or similar is controlling the SVG, ensure you **don’t hardcode width/height** on the element. Instead, set those in CSS and use the `viewBox` for scaling.

---

### 📦 5. **Fix Bottom Panels (e.g. `.file-control-row`)**

Make sure this container does not overlap the Sankey:

```css
.file-control-row {
  flex-shrink: 0;
  padding-top: 5px;
}
```

Place this component **after** `.sankey-container` in the layout.

---

### 📀 6. **Optional: Add Resize Handling**

If the Sankey diagram needs to re-layout on container size changes:

- Use a `ResizeObserver` to detect dimension changes.
- Trigger a `useEffect` or similar hook to re-run layout logic.

Example hook:

```ts
useResizeObserver(containerRef, () => {
  // Trigger Sankey layout resize here
});
```

---

### ✅ Final Component Structure

```tsx
<div className="App">
  <Header />
  <div className="sankey-view-container">
    <div className="sankey-container">
      <SankeyDiagram />
    </div>
    <div className="file-control-row">
      <FileControls />
    </div>
  </div>
</div>
```

---

### 📊 Test Cases

- Resize browser vertically → Sankey should scale without overlap.
- Toggle panels above/below → Sankey should adjust height.
- Confirm SVG renders cleanly at various resolutions.
