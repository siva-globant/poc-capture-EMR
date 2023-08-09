import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { MediaRecorder } from "extendable-media-recorder";
import type { IMediaRecorder } from "extendable-media-recorder";
import "./App.css";
import {
  useMonitoring,
  SentryOperation,
  SentryTransaction,
  SentryTag,
  SentrySpan,
} from "./context";
type ResolutionValueUnions =
  | "default"
  | "1920x1080"
  | "1280x720"
  | "640x480"
  | "3840x2160";
type BitRateValueUnions =
  | "default"
  | "8000000000"
  | "800000000"
  | "8000000"
  | "800000"
  | "8000"
  | "800";
type FrameRateValueUnions = "default" | "15" | "24" | "30" | "60";

interface ISelectRecord<T = string> {
  label: string;
  value: T;
}
const RESOLUTIONS: Array<ISelectRecord<ResolutionValueUnions>> = [
  {
    label: "Default",
    value: "default",
  },
  {
    label: "4K Ultra HD (3840x2160)",
    value: "3840x2160",
  },
  {
    label: "1080p",
    value: "1920x1080",
  },
  {
    label: "720p",
    value: "1280x720",
  },
  {
    label: "480p",
    value: "640x480",
  },
];
const BIT_RATES: Array<ISelectRecord<BitRateValueUnions>> = [
  {
    label: "Default bps",
    value: "default",
  },
  {
    label: "1 GB bps",
    value: "8000000000",
  },
  {
    label: "100 MB bps",
    value: "800000000",
  },
  {
    label: "1 MB bps",
    value: "8000000",
  },
  {
    label: "100 KB bps",
    value: "800000",
  },
  {
    label: "1 KB bps",
    value: "8000",
  },
  {
    label: "100 Bytes bps",
    value: "800",
  },
];
const FRAME_RATES: Array<ISelectRecord<FrameRateValueUnions>> = [
  {
    label: "Default FPS",
    value: "default",
  },
  {
    label: "15 FPS",
    value: "15",
  },
  {
    label: "24 FPS",
    value: "24",
  },
  {
    label: "30 FPS",
    value: "30",
  },
  {
    label: "60 FPS",
    value: "60",
  },
];
interface IRecordedVideoState {
  url: string;
  name: string;
  resolution: string;
  bitRate: string;
  frameRate: string;
  size: string;
  type: string;
  videoHeight?: number;
  videoWidth?: number;
  duration?: number;
}
function App() {
  const mediaRecordRef = useRef<IMediaRecorder | null>(null);
  const liveStream = useRef<HTMLVideoElement>(null);
  const mediaChunks = useRef<Blob[]>([]);
  const mediaStream = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);

  const [currrentResolution, setCurrrentResolution] =
    useState<ResolutionValueUnions>("default");
  const [currrentBitRate, setCurrrentBitRate] =
    useState<BitRateValueUnions>("default");
  const [currrentFrameRate, setCurrrentFrameRate] =
    useState<FrameRateValueUnions>("default");
  // const [recordingStatus,setRecordingStatus]=useState<"idle"|"recording">("idle")
  const [recordedVideo, setRecordedVideo] = useState<IRecordedVideoState[]>([]);

  const { measurePerformance } = useMonitoring();

  const bytesToSize = (bytes: number) => {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes == 0) return "n/a";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i == 0) return bytes + " " + sizes[i];
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  };

  const getCameraPermission = async () => {
    try {
      const [mediaWidth, mediaHeight] =
        currrentResolution === "default" ? [] : currrentResolution.split("x");
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: Number(mediaWidth),
          height: Number(mediaHeight),
          frameRate:
            currrentFrameRate === "default"
              ? undefined
              : Number(currrentFrameRate),
        },
      });
      mediaStream.current = new MediaStream(videoStream.getVideoTracks());
      if (liveStream.current) {
        liveStream.current.srcObject = videoStream;
      }
    } catch (e) {
      console.log(e);
    }
  };

  const startRecording = async () => {
    const transaction = measurePerformance(
      SentryTransaction.VIDEO_PROCESSING,
      SentryOperation.VIDEO_CAPTURE
    );
    transaction.setTag(
      SentryTag.INSPECTION_ID,
      `Random-${Math.floor(Math.random() * 100)}`
    );

    transaction.startSpan(SentrySpan.ASK_PERMISSION, null);
    await getCameraPermission();
    transaction.finishSpan(SentrySpan.ASK_PERMISSION);

    transaction.startSpan(SentrySpan.TAKE_VIDEO, null);
    setIsRecording(true);
    if (!mediaStream.current) return alert("Cannot record Now");
    const media = new MediaRecorder(mediaStream.current, {
      mimeType: "video/webm",
    });
    mediaRecordRef.current = media;
    mediaRecordRef.current.start();
    mediaRecordRef.current.onerror = (event) => {
      console.log("OnError", event);
    };
    mediaRecordRef.current.onstop = () => {
      transaction.finishSpan(SentrySpan.TAKE_VIDEO);

      transaction.startSpan(SentrySpan.BLOB_MERGING, null);
      const [chunk] = mediaChunks.current;
      const blob = new Blob(mediaChunks.current, { type: chunk.type });
      const url = URL.createObjectURL(blob);
      const currentRecordVideoInfo = {
        name: `VideoRecord-${recordedVideo.length + 1}`,
        resolution: currrentResolution,
        bitRate: currrentBitRate,
        frameRate: currrentFrameRate,
        size: bytesToSize(blob.size),
        type: blob.type,
        url,
      };
      setRecordedVideo((prevState) => [...prevState, currentRecordVideoInfo]);
      mediaChunks.current = [];
      transaction.finishSpan(SentrySpan.BLOB_MERGING);
    };
    mediaRecordRef.current.ondataavailable = (event) => {
      console.log("Recording done");

      if (typeof event.data === "undefined") return;
      if (event.data.size === 0) return;
      mediaChunks.current.push(event.data);
    };
  };
  const stopRecording = () => {
    setIsRecording(false);
    if (!mediaRecordRef.current) return;

    mediaRecordRef.current.stop();
    if (mediaStream.current)
      mediaStream.current.getTracks().forEach((track) => track.stop());
    if (liveStream.current) liveStream.current.srcObject = null;
  };
  const onResolutionChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: ResolutionValueUnions };
    }
  ) => {
    setCurrrentResolution(event.target.value);
  };
  const onBitRateChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: BitRateValueUnions };
    }
  ) => {
    setCurrrentBitRate(event.target.value);
  };
  const onFrameRateChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: FrameRateValueUnions };
    }
  ) => {
    setCurrrentFrameRate(event.target.value);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "36px",
        maxHeight: "100vh",
        overflowY: "hidden",
      }}
    >
      <div style={{ flex: 8 }}>
        <div
          style={{
            height: "80vh",
            backgroundColor: "greenyellow",
          }}
        >
          <video
            style={{ width: "100%", height: "100%", aspectRatio: 16 / 9 }}
            ref={liveStream}
            autoPlay
            muted
            playsInline
          />
        </div>
        <div>
          <select value={currrentResolution} onChange={onResolutionChange}>
            {RESOLUTIONS.map(({ label, value }) => (
              <option key={`resolutions#${value}`} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={currrentBitRate} onChange={onBitRateChange}>
            {BIT_RATES.map(({ label, value }) => (
              <option key={`bit_rates#${value}`} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={currrentFrameRate} onChange={onFrameRateChange}>
            {FRAME_RATES.map(({ label, value }) => (
              <option key={`frame_rates#${value}`} value={value}>
                {label}
              </option>
            ))}
          </select>
          <br />
          <button onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? "Stop Recording" : "Start Record"}
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 3,
          maxHeight: "80vh",
          overflowY: "scroll",
        }}
      >
        {recordedVideo.map((ele, index) => (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "grey",
              padding: "8px",
              margin: "8px 0px",
            }}
          >
            <video
              onLoadedMetadata={(event) => {
                const { duration, videoHeight, videoWidth } =
                  event.currentTarget;
                setRecordedVideo((prevState) => {
                  prevState[index] = {
                    ...prevState[index],
                    duration,
                    videoHeight,
                    videoWidth,
                  };
                  return [...prevState];
                });

                console.log(index, {
                  duration,
                  videoHeight,
                  videoWidth,
                });
              }}
              style={{ width: "150px", aspectRatio: 16 / 9 }}
              controls
              src={ele.url}
            />
            <div
              style={{
                display: "flex",
                gap: "4px",
                flexWrap: "wrap",
                justifyContent: "space-around",
              }}
            >
              {Object.keys(ele)
                .filter((e) => !["url"].includes(e))
                .map((eleKey) => (
                  <p>
                    {/* @ts-ignore */}
                    {eleKey}:{ele[eleKey]}
                  </p>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
