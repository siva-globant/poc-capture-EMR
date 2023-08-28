import { useEffect, useRef, useState } from "react";
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
  type SentryTransactionObject,
} from "./context";
import { useProfiler } from "@sentry/react";

type ResolutionValueUnions = "1920x1080" | "1280x720" | "640x480" | "3840x2160";
type BitRateValueUnions =
  | "8000000000"
  | "800000000"
  | "8000000"
  | "800000"
  | "8000"
  | "800";
type FrameRateValueUnions = "15" | "24" | "30" | "60";

interface ISelectRecord<T = string> {
  label: string;
  value: T;
}
interface IRecordedVideoState {
  url: string;
  name: string;
  resolution?: ResolutionValueUnions;
  bitRate?: BitRateValueUnions;
  frameRate?: FrameRateValueUnions;
  size: string;
  type: string;
  videoHeight?: number;
  videoWidth?: number;
  duration?: number;
}
const RESOLUTIONS: Array<ISelectRecord<ResolutionValueUnions>> = [
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

const isPortrait = true,
  COMPRESSION_RATIO = 0.8,
  IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  MIME_TYPE = IS_SAFARI ? "video/mp4;codecs=avc1" : "video/webm;codecs=vp8",
  EXTENSION = IS_SAFARI ? ".mp4" : ".webm";

function App() {
  const { measurePerformance } = useMonitoring();
  useProfiler("MainApp");

  const mediaRecordRef = useRef<IMediaRecorder | null>(null);
  const videoEleRef = useRef<HTMLVideoElement>(null);
  const mediaChunks = useRef<Blob[]>([]);
  const mediaStream = useRef<MediaStream | null>(null);
  const transaction = useRef<SentryTransactionObject | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [fetchingCameraInfo, setFetchingCameraInfo] = useState<boolean>(true);

  const [currentResolution, setCurrentResolution] =
    useState<ResolutionValueUnions>();
  const [currentBitRate, setCurrentBitRate] = useState<BitRateValueUnions>();
  const [currentFrameRate, setCurrentFrameRate] =
    useState<FrameRateValueUnions>();
  const [currentCameraCapability, setCurrentCameraCapability] =
    useState<MediaTrackCapabilities | null>(null);
  // const [recordingStatus,setRecordingStatus]=useState<"idle"|"recording">("idle")
  const [recordedVideo, setRecordedVideo] = useState<IRecordedVideoState[]>([]);

  const bytesToSize = (bytes: number) => {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes == 0) return "n/a";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i == 0) return bytes + " " + sizes[i];
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  };

  const getCameraPermission = async () => {
    try {
      const [mediaWidth, mediaHeight] = currentResolution
        ? currentResolution.split("x")
        : [];
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: isPortrait ? Number(mediaHeight) : Number(mediaWidth),
          height: isPortrait ? Number(mediaWidth) : Number(mediaHeight),
          facingMode: "environment",
          frameRate: currentFrameRate ? undefined : Number(currentFrameRate),
        },
      });
      mediaStream.current = new MediaStream(videoStream.getVideoTracks());
      if (videoEleRef.current) {
        videoEleRef.current.srcObject = videoStream;
      }
    } catch (e) {
      console.log(e);
    }
  };
  const getCameraCapability = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      const device = videoDevices[0];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: device.deviceId, facingMode: "environment" },
      });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      setCurrentCameraCapability(capabilities);
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Error:", error);
    }
    setFetchingCameraInfo(false);
  };

  useEffect(() => {
    getCameraCapability();
  }, []);

  useEffect(() => {
    if (currentCameraCapability) {
      const {
        frameRate,
        width: { max: supportedMaxWidth } = {},
        height: { max: supportedMinHeight } = {},
      } = currentCameraCapability;
      if (frameRate?.max) {
        const matchedFrameRateIndex = FRAME_RATES.findIndex(
          (e) => e.value === String(frameRate.max)
        );
        setCurrentFrameRate(FRAME_RATES[matchedFrameRateIndex]?.value);
      }
      if (supportedMaxWidth && supportedMinHeight) {
        const matchedResIndex = RESOLUTIONS.findIndex((e) => {
          const [w, h] = e.value.split("x"); //1920x1080
          return (
            supportedMaxWidth >= Number(w) && supportedMinHeight >= Number(h)
          );
        });

        setCurrentResolution(RESOLUTIONS[matchedResIndex]?.value);
      }
    }
  }, [currentCameraCapability]);

  useEffect(() => {
    if (currentResolution && currentFrameRate) {
      const [w, h] = currentResolution.split("x");
      const bitRate =
        Number(w) * Number(h) * Number(currentFrameRate) * COMPRESSION_RATIO;
      const matchedBitRateIndex = BIT_RATES.findIndex(
        (e) => Number(e.value) <= bitRate
      );
      setCurrentBitRate(BIT_RATES[matchedBitRateIndex]?.value);
    }
  }, [currentFrameRate, currentResolution]);
  const startRecording = async () => {
    transaction.current = measurePerformance(
      SentryTransaction.VIDEO_PROCESSING,
      SentryOperation.VIDEO_CAPTURE
    );
    const { setTag, startSpan, finishSpan, finish } = transaction.current;
    setTag(
      SentryTag.INSPECTION_ID,
      `Random-${Math.floor(Math.random() * 100)}`
    );

    startSpan(SentrySpan.ASK_PERMISSION, null);
    await getCameraPermission();
    finishSpan(SentrySpan.ASK_PERMISSION);

    startSpan(SentrySpan.TAKE_VIDEO, {
      RESOLUTION: currentResolution as string,
      BIT_RATE: currentBitRate as string,
      FRAME_RATE: currentFrameRate as string,
    });
    setIsRecording(true);
    if (!mediaStream.current) return alert("Cannot record Now");
    const media = new MediaRecorder(mediaStream.current, {
      mimeType: MIME_TYPE,
      bitsPerSecond: Number(currentBitRate),
    });
    mediaRecordRef.current = media;
    mediaRecordRef.current.start();
    mediaRecordRef.current.onerror = (event) => {
      console.log("OnError", event);
    };
    mediaRecordRef.current.onstop = () => {
      finishSpan(SentrySpan.TAKE_VIDEO);

      const [chunk] = mediaChunks.current;
      const blob = new Blob(mediaChunks.current, { type: chunk.type });
      const url = URL.createObjectURL(blob);
      const currentRecordVideoInfo = {
        name: `VideoRecord-${recordedVideo.length + 1}${EXTENSION}`,
        resolution: currentResolution,
        bitRate: currentBitRate,
        frameRate: currentFrameRate,
        size: bytesToSize(blob.size),
        type: blob.type,
        url,
      };
      startSpan(SentrySpan.BLOB_MERGING, {
        RESOLUTION: currentRecordVideoInfo["resolution"] as string,
        BIT_RATE: currentRecordVideoInfo["bitRate"] as string,
        FRAME_RATE: currentRecordVideoInfo["frameRate"] as string,
        SIZE: currentRecordVideoInfo["size"],
        TYPE: currentRecordVideoInfo["type"],
      });
      setRecordedVideo((prevState) => [...prevState, currentRecordVideoInfo]);
      mediaChunks.current = [];
      finishSpan(SentrySpan.BLOB_MERGING);
      finish("SUCCESS");
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
    if (videoEleRef.current) videoEleRef.current.srcObject = null;
  };
  const onResolutionChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: ResolutionValueUnions };
    }
  ) => {
    setCurrentResolution(event.target.value);
  };
  const onBitRateChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: BitRateValueUnions };
    }
  ) => {
    setCurrentBitRate(event.target.value);
  };
  const onFrameRateChange = (
    event: ChangeEvent<HTMLSelectElement> & {
      target: { value: FrameRateValueUnions };
    }
  ) => {
    setCurrentFrameRate(event.target.value);
  };
  const { frameRate, height, width } = currentCameraCapability ?? {};
  if (fetchingCameraInfo) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div className="loader" />
        <div>
          Fetching Camera info <br />
          Press "Allow" to get Camera Info
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div>
        <h3>
          POC Video Capture -{" "}
          <a target="_blank" href="https://siva-globant.github.io/poc-capture/">
            Native
          </a>{" "}
          | ExtendableMediaRecorder |{" "}
          <a
            target="_blank"
            href="https://siva-globant.github.io/poc-capture-record_rtc/"
          >
            Record RTC
          </a>{" "}
          |{" "}
          <a
            target="_blank"
            href="https://siva-globant.github.io/poc-capture-react_webcam"
          >
            React WebCam
          </a>
        </h3>
      </div>
      <div
        style={{
          display: "flex",
          gap: "36px",
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
              style={{ width: "100%", height: "100%", aspectRatio: 9 / 16 }}
              ref={videoEleRef}
              autoPlay
              muted
              playsInline
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              padding: "10px 0px",
            }}
          >
            <div>
              <span>Resolution: </span>
              <select value={currentResolution} onChange={onResolutionChange}>
                {RESOLUTIONS.map(({ label, value }) => (
                  <option key={`resolutions#${value}`} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span>FPS: </span>
              <select value={currentFrameRate} onChange={onFrameRateChange}>
                {FRAME_RATES.map(({ label, value }) => (
                  <option
                    disabled={Number(value) > Number(frameRate?.max)}
                    key={`frame_rates#${value}`}
                    value={value}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span>BitRate: </span>
              <select
                disabled
                value={currentBitRate}
                onChange={onBitRateChange}
              >
                {BIT_RATES.map(({ label, value }) => (
                  <option key={`bit_rates#${value}`} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "grey",
              padding: "8px",
              margin: "8px 0px",
            }}
          >
            Camera Info
            <br />
            <span>Max FPS : {frameRate?.max || "N/A"}</span>
            <span>
              Max Resolution(WxH) : {`${width?.max}x${height?.max}` || "N/A"}
            </span>
          </div>
          {recordedVideo.map((ele, index) => (
            <div
              key={`Video#${index}`}
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
                  const { videoHeight, videoWidth } = event.currentTarget;
                  setRecordedVideo((prevState) => {
                    prevState[index] = {
                      ...prevState[index],
                      videoHeight,
                      videoWidth,
                    };
                    return [...prevState];
                  });
                }}
                style={{
                  width: "100%",
                  aspectRatio: 16 / 9,
                }}
                controls
                src={ele.url}
              />
              <div>
                Name : {ele.name}
                <h4>Config Info</h4>
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Resolution: {ele.resolution}</span>
                  <span>Frame Rate: {ele.frameRate}</span>
                  <span>Bit Rate: {ele.bitRate}</span>
                </div>
                <h4>Video Info</h4>
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Mime Type: {ele.type}</span>
                  <span>Video Width: {ele.videoWidth}</span>
                  <span>Video Height: {ele.videoHeight}</span>
                  <span>Size: {ele.size}</span>
                </div>
              </div>
              <a className="button" href={ele.url} download={ele.name}>
                Download
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
