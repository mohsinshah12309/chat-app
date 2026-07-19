import { useRef, useState, useEffect } from "react";
import styles from "./VoiceRecorder.module.css";

const BAR_COUNT = 28;

// Renders a live amplitude meter while recording, using the Web Audio API's
// AnalyserNode sampled on an animation frame — this is a real-time level
// meter (how loud the mic input is right now), not a full frequency
// spectrum, which is enough to make recording feel alive without the
// complexity of a true FFT visualization.
function useLiveLevels(analyser, isRecording) {
  const [levels, setLevels] = useState(new Array(BAR_COUNT).fill(4));
  const rafRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    if (!analyser || !isRecording) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataRef.current);
      // Downsample the frequency bins into BAR_COUNT buckets by averaging
      const bucketSize = Math.floor(dataRef.current.length / BAR_COUNT) || 1;
      const next = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += dataRef.current[i * bucketSize + j] || 0;
        }
        const avg = sum / bucketSize;
        next.push(Math.max(4, Math.min(32, (avg / 255) * 32)));
      }
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, isRecording]);

  return levels;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VoiceRecorder({ onRecorded, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState(null);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const timerRef = useRef(null);

  const levels = useLiveLevels(analyser, isRecording);

  useEffect(() => {
    startRecording();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch (err) {
      console.error("Microphone access failed:", err.message);
      setError("Microphone access denied or unavailable.");
    }
  }

  function cleanup() {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => {});
  }

  function handleStop() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      cleanup();
      setIsRecording(false);
      onRecorded(blob);
    };
    recorder.stop();
  }

  function handleCancel() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setIsRecording(false);
    onCancel();
  }

  if (error) {
    return (
      <div className={styles.wrap}>
        <span className={styles.error}>{error}</span>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>✕</button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.cancelBtn} onClick={handleCancel} aria-label="Cancel recording">
        ✕
      </button>

      <div className={styles.levels}>
        {levels.map((h, i) => (
          <span key={i} className={styles.levelBar} style={{ height: `${h}px` }} />
        ))}
      </div>

      <span className={styles.timer}>{formatDuration(elapsed)}</span>

      <button type="button" className={styles.stopBtn} onClick={handleStop} aria-label="Stop and send">
        ✓
      </button>
    </div>
  );
}

export default VoiceRecorder;