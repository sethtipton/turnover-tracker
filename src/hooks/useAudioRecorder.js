import { useEffect, useRef, useState } from "react";

const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

export function useAudioRecorder({ propertyId, unitId, onMessage }) {
  const [state, setState] = useState("idle");
  const [level, setLevel] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const audioFrameRef = useRef(null);
  const audioPeakRef = useRef(0);
  const objectUrlsRef = useRef(new Set());

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setLevel);
      mediaRecorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function start() {
    if (!propertyId) {
      onMessage("Select a property before recording.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onMessage("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const startedAt = Date.now();
      audioPeakRef.current = 0;
      chunksRef.current = [];
      startAudioMonitor(stream, setLevel, audioContextRef, audioFrameRef, audioPeakRef);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setLevel);
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setState("idle");
        onMessage("Recording stopped because the browser reported a microphone error.");
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationMs = Date.now() - startedAt;
        const peakLevel = stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setLevel);
        stream.getTracks().forEach((track) => track.stop());
        setState("idle");
        mediaRecorderRef.current = null;

        if (blob.size < 512) {
          onMessage("Recording was empty. Check microphone permission and try again.");
          return;
        }

        const extension = getAudioExtension(blob.type);
        const file = new File([blob], `dictation-${Date.now()}.${extension}`, { type: blob.type });
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.add(url);
        setRecordings((current) => [{
          id: crypto.randomUUID(),
          file,
          url,
          propertyId,
          unitId: unitId || null,
          durationMs,
          size: blob.size,
          mimeType: blob.type,
          peakLevel,
        }, ...current]);
        onMessage(peakLevel < 0.015
          ? "Recording ready, but no mic input was detected. Check your input device before saving."
          : "Recording ready. Play it back before saving if you want to confirm audio.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setState("recording");
      onMessage("");
    } catch (error) {
      stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setLevel);
      onMessage(getMicrophoneErrorMessage(error));
      setState("idle");
    }
  }

  function stop() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }

  function removeRecording(recordingId) {
    setRecordings((current) => current.filter((recording) => {
      if (recording.id !== recordingId) return true;
      URL.revokeObjectURL(recording.url);
      objectUrlsRef.current.delete(recording.url);
      return false;
    }));
  }

  return { state, level, recordings, start, stop, removeRecording };
}

function getSupportedAudioMimeType() {
  return AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function getAudioExtension(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function getMicrophoneErrorMessage(error) {
  if (error?.name === "NotAllowedError") return "Microphone access was blocked. Allow microphone access in your browser settings and try again.";
  if (error?.name === "NotFoundError") return "No microphone was found on this device.";
  if (error?.name === "NotReadableError") return "The microphone is already in use by another app or browser tab.";
  return error?.message || "The recording could not be started.";
}

function startAudioMonitor(stream, setLevel, audioContextRef, audioFrameRef, audioPeakRef) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  const source = audioContext.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.fftSize);
  source.connect(analyser);
  audioContextRef.current = audioContext;

  let lastUpdate = 0;
  function tick(timestamp) {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    const nextLevel = Math.min(1, rms * 8);
    audioPeakRef.current = Math.max(audioPeakRef.current, nextLevel);
    if (timestamp - lastUpdate > 90) {
      setLevel(nextLevel);
      lastUpdate = timestamp;
    }

    audioFrameRef.current = requestAnimationFrame(tick);
  }

  audioFrameRef.current = requestAnimationFrame(tick);
}

function stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setLevel) {
  const peakLevel = audioPeakRef.current;
  if (audioFrameRef.current) {
    cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null;
  }

  audioContextRef.current?.close?.();
  audioContextRef.current = null;
  audioPeakRef.current = 0;
  setLevel(0);
  return peakLevel;
}
