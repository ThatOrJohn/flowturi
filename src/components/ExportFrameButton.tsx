import { useState } from "react";
import html2canvas from "html2canvas";

interface ExportFrameButtonProps {
  targetRef: React.RefObject<HTMLElement | SVGSVGElement>; // Reference to the element to capture
  theme: "light" | "dark";
}

const ExportFrameButton: React.FC<ExportFrameButtonProps> = ({
  targetRef,
  theme,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const exportFrame = async () => {
    if (!targetRef.current) {
      console.error("Target element not found");
      return;
    }

    try {
      setIsExporting(true);

      // Capture the current frame
      const canvas = await html2canvas(targetRef.current as HTMLElement, {
        backgroundColor: theme === "dark" ? "#181a20" : "#f7f7f7", // Set background based on theme
        scale: 2, // Higher resolution export
        logging: false,
        useCORS: true,
      });

      // Create a download link for the PNG
      const pngFileName = `flowturi-frame-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.png`;

      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");

      // Create a download link and trigger click
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = pngFileName;
      a.click();
    } catch (error) {
      console.error("Error exporting frame:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={exportFrame}
      className={`export-frame-button ${theme}`}
      disabled={isExporting}
      title="Export current frame as PNG"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path
          d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"
          fill="currentColor"
        />
      </svg>
      <span>{isExporting ? "Exporting..." : "Export Frame"}</span>
    </button>
  );
};

export default ExportFrameButton;
