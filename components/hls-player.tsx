"use client";

import Hls from "hls.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type HlsPlayerProps = {
  src: string;
  controls?: boolean;
  className?: string;
};

export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(
  function HlsPlayer({ src, controls = true, className }, forwardedRef) {
    const ref = useRef<HTMLVideoElement>(null);
    const [failed, setFailed] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement);

    useEffect(() => {
      const video = ref.current;
      if (!video || !src) return;
      setFailed(false);

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
            setFailed(true);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setFailed(true);
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
    }, [retryKey, src]);

    return (
      <div className="hls-player-wrap">
        <video
          ref={ref}
          aria-label="Educational video"
          className={className}
          controls={controls}
          onError={() => setFailed(true)}
          onLoadedData={() => setFailed(false)}
          playsInline
          preload="metadata"
        >
          Your browser does not support HLS video.
        </video>
        {failed ? (
          <div className="hls-error" role="alert">
            <strong>This video paused while loading.</strong>
            <button
              onClick={() => setRetryKey((current) => current + 1)}
              type="button"
            >
              Try video again
            </button>
          </div>
        ) : null}
      </div>
    );
  },
);
