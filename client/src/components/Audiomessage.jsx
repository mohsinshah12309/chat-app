import { useEffect, useRef, useState } from "react";
import styles from "./AudioMessage.module.css";

const BAR_COUNT = 40;

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Fetches the audio once and decodes it via the Web Audio API to extract
// real amplitude peaks — this is an actual waveform of the recording, not a
// generic placeholder animation. Decoded once per message and cached in
// component state; cheap enough for short voice notes.
function useWaveformPeaks(src) {
  const [peaks, setPeaks] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function decode() {
      try {
        const res = await fetch(src);
        const arrayBuffer = await res.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / BAR_COUNT);

        const computedPeaks = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j] || 0);
          }
          computedPeaks.push(sum / blockSize);
        }

        const max = Math.max(...computedPeaks, 0.0001);
        const normalized = computedPeaks.map((p) => p / max);

        audioContext.close().catch(() => {});
        if (!cancelled) setPeaks(normalized);
      } catch (err) {
        console.error("Waveform decode failed:", err.message);
        if (!cancelled) setPeaks(new Array(BAR_COUNT).fill(0.4));
      }
    }

    decode();
    return () => { cancelled = true; };
  }, [src]);

  return peaks;
}

function AudioMessage({ src, duration: fallbackDuration }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration || 0);

  const peaks = useWaveformPeaks(src);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate() { setCurrentTime(audio.currentTime); }
    function onLoadedMetadata() {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    }
    function onEnded() { setIsPlaying(false); setCurrentTime(0); }

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }

  function handleBarClick(index) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const fraction = index / BAR_COUNT;
    audio.currentTime = fraction * duration;
    setCurrentTime(audio.currentTime);
  }

  const progressFraction = duration ? currentTime / duration : 0;
  const activeBarIndex = Math.floor(progressFraction * BAR_COUNT);

  return (
    <div className={styles.wrap}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button type="button" className={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? "❚❚" : "▶"}
      </button>

      <div className={styles.waveform}>
        {(peaks || new Array(BAR_COUNT).fill(0.3)).map((p, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.bar} ${i <= activeBarIndex ? styles.barActive : ""}`}
            style={{ height: `${Math.max(3, p * 24)}px` }}
            onClick={() => handleBarClick(i)}
            aria-label={`Seek to ${Math.round((i / BAR_COUNT) * 100)}%`}
          />
        ))}
      </div>

      <span className={styles.time}>{formatDuration(isPlaying || currentTime > 0 ? currentTime : duration)}</span>
    </div>
  );
}

export default AudioMessage;