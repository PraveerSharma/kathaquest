"use client";

import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type HlsPlayerProps = {
  src: string;
  controls?: boolean;
  className?: string;
};

export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(
  function HlsPlayer({ src, controls = true, className }, forwardedRef) {
    const ref = useRef<HTMLVideoElement>(null);
    useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement);

    useEffect(() => {
      const video = ref.current;
      if (!video || !src) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startFragPrefetch: true,
        });
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
        hls.attachMedia(video);
        return () => {
          hls.destroy();
          video.removeAttribute("src");
          video.load();
        };
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      }
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
  },
);
