"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

export function HlsPlayer({
  src,
  controls = true,
  className,
}: {
  src: string;
  controls?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) return;
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => hls.destroy();
  }, [src]);

  return (
    <video
      ref={ref}
      className={className}
      controls={controls}
      playsInline
      preload="metadata"
    >
      Your browser does not support HLS video.
    </video>
  );
}
