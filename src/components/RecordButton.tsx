import { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";

interface RecordButtonProps {
  targetRef: React.RefObject<HTMLElement | SVGSVGElement>; // Reference to the element to record
  isPlaying: boolean; // Whether animation is currently playing
  setIsPlaying: (playing: boolean) => void; // Function to control animation playback
  resetAnimation: () => void; // Function to reset animation to start
  duration: number; // Estimated animation duration in ms
  theme: "light" | "dark";
  speedMultiplier: number; // Animation speed multiplier
}

const RecordButton: React.FC<RecordButtonProps> = ({
  targetRef,
  isPlaying,
  setIsPlaying,
  resetAnimation,
  duration,
  theme,
  speedMultiplier,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingAvailable, setRecordingAvailable] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState("Ready");
  const framesRef = useRef<HTMLCanvasElement[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const videoFileName = useRef(
    `flowturi-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`
  );

  // Clean up any existing recording data when component unmounts
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current);
      }
    };
  }, [downloadUrl]);

  // Convert a series of canvas frames into a video blob
  const framesToVideo = async (
    frames: HTMLCanvasElement[],
    fps: number = 10
  ): Promise<Blob> => {
    // Get dimensions from the first frame
    const width = frames[0].width;
    const height = frames[0].height;

    // Create an offscreen canvas for encoding
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Set up MediaRecorder with best available options
    let mimeType = "video/webm";
    let options = {};

    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mimeType = "video/webm;codecs=vp9";
      options = { mimeType, videoBitsPerSecond: 5000000 }; // 5 Mbps
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      mimeType = "video/webm;codecs=vp8";
      options = { mimeType, videoBitsPerSecond: 5000000 };
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      mimeType = "video/webm";
      options = { mimeType };
    }

    setRecordingStatus(`Processing ${frames.length} frames to ${mimeType}...`);

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, options);

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    // Create a promise that resolves when recording is complete
    const recordingPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        setRecordingStatus(
          `Created ${(blob.size / (1024 * 1024)).toFixed(2)}MB video`
        );
        resolve(blob);
      };
    });

    // Start recording
    recorder.start();

    // Process frames at a controlled rate to avoid UI freezing
    const frameChunkSize = 5; // Process frames in small batches
    const totalFrames = frames.length;

    for (let i = 0; i < totalFrames; i += frameChunkSize) {
      // Process a chunk of frames
      const endIdx = Math.min(i + frameChunkSize, totalFrames);

      for (let j = i; j < endIdx; j++) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(frames[j], 0, 0);

        // Update progress less frequently to avoid UI thrashing
        if (j % 3 === 0 || j === totalFrames - 1) {
          setProcessingProgress(Math.round((j / (totalFrames - 1)) * 100));
        }

        // Small delay between frames for proper encoding
        await new Promise((resolve) => setTimeout(resolve, 1000 / (fps * 2)));
      }

      // Yield to browser to update UI
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Finish recording after a small delay to ensure last frame is captured
    await new Promise((resolve) => setTimeout(resolve, 200));
    recorder.stop();

    return recordingPromise;
  };

  const startRecording = async () => {
    if (!targetRef.current) {
      console.error("Target element not found");
      return;
    }

    // Reset any previous recording
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    framesRef.current = [];
    setRecordingAvailable(false);
    setRecordingProgress(0);
    setProcessingProgress(0);
    setCapturedFrames(0);
    setRecordingStatus("Starting recording...");
    videoFileName.current = `flowturi-recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.webm`;

    try {
      // Reset and start the animation
      resetAnimation();
      setIsPlaying(true);
      setIsRecording(true);

      // Calculate frames per second based on animation speed
      // Using a lower base FPS for smoother recording with fewer frames
      const fps = Math.max(5, Math.min(15, 8 * speedMultiplier));
      const frameInterval = Math.floor(1000 / fps);
      const estimatedTotalFrames = Math.ceil((duration / 1000) * fps);

      setRecordingStatus(`Recording (${Math.round(fps)} FPS)`);
      let frameCount = 0;

      // Start capturing frames at regular intervals
      recordingIntervalRef.current = window.setInterval(async () => {
        if (!targetRef.current || frameCount >= estimatedTotalFrames) {
          stopRecording();
          return;
        }

        try {
          // Capture current frame
          const canvas = await html2canvas(targetRef.current as HTMLElement, {
            backgroundColor: theme === "dark" ? "#181a20" : "#f7f7f7", // Set background based on theme
            scale: 1,
            logging: false,
            useCORS: true,
          });

          framesRef.current.push(canvas);
          frameCount++;
          setCapturedFrames(frameCount);

          // Update progress
          const percentage = Math.round(
            (frameCount / estimatedTotalFrames) * 100
          );
          setRecordingProgress(Math.min(percentage, 99)); // Cap at 99% until processing

          // Update status periodically
          if (frameCount % 10 === 0) {
            setRecordingStatus(
              `Captured ${frameCount} frames (${Math.round(fps)} FPS)`
            );
          }
        } catch (err) {
          console.error("Error capturing frame:", err);
        }
      }, frameInterval);
    } catch (error) {
      console.error("Error starting recording:", error);
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const stopRecording = async () => {
    // Clear the recording interval
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Stop the animation
    setIsPlaying(false);
    setIsRecording(false);
    setRecordingStatus("Preparing video...");

    // If we have frames, process them into a video
    if (framesRef.current.length > 0) {
      try {
        const frameCount = framesRef.current.length;
        setIsProcessing(true);
        setProcessingProgress(0);
        setRecordingStatus(`Processing ${frameCount} frames...`);

        // Calculate an appropriate FPS based on the number of frames and duration
        // We want the output video to respect the original speed multiplier
        const baseFps = 10; // baseline fps
        const targetFps = Math.max(10, Math.min(30, baseFps * speedMultiplier));

        // Convert frames to video
        const videoBlob = await framesToVideo(framesRef.current, targetFps);

        // Create download URL
        const url = URL.createObjectURL(videoBlob);
        setDownloadUrl(url);
        setRecordingAvailable(true);

        const videoSize = (videoBlob.size / (1024 * 1024)).toFixed(2);
        setRecordingStatus(`Ready: ${frameCount} frames, ${videoSize}MB`);
      } catch (err) {
        console.error("Error creating video:", err);
        setRecordingStatus("Error creating video");
      } finally {
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    } else {
      setRecordingStatus("No frames captured");
    }

    setRecordingProgress(0);
  };

  const downloadRecording = () => {
    if (!downloadUrl) return;

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = videoFileName.current;
    a.click();
  };

  return (
    <div className={`recording-controls ${theme}`}>
      {!isRecording && !isProcessing && !recordingAvailable && (
        <button
          onClick={startRecording}
          className={`record-button ${theme}`}
          disabled={isPlaying}
          title="Record animation"
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="6" fill="currentColor" />
          </svg>
          <span>Record</span>
        </button>
      )}

      {isRecording && (
        <button
          onClick={stopRecording}
          className={`stop-button ${theme}`}
          title="Stop recording"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <rect x="4" y="4" width="8" height="8" fill="currentColor" />
          </svg>
          <span className="recording-progress">{recordingProgress}%</span>
          <span>Stop ({capturedFrames})</span>
        </button>
      )}

      {isProcessing && (
        <button
          className={`processing-button ${theme}`}
          disabled
          title={recordingStatus}
        >
          <span className="processing-progress">{processingProgress}%</span>
          <span>Processing...</span>
        </button>
      )}

      {recordingAvailable && (
        <div className="recording-actions">
          <button
            onClick={downloadRecording}
            className={`download-button ${theme}`}
            title="Download recording"
          >
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"
                fill="currentColor"
              />
            </svg>
            <span>Download</span>
          </button>

          <button
            onClick={startRecording}
            className={`record-again-button ${theme}`}
            title="Record again"
          >
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"
                fill="currentColor"
              />
            </svg>
            <span>Record Again</span>
          </button>
        </div>
      )}

      {(isRecording || isProcessing || recordingAvailable) && (
        <div className="recording-status" title={recordingStatus}>
          {recordingStatus}
        </div>
      )}
    </div>
  );
};

export default RecordButton;
