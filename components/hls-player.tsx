"use client";

import Hls from "hls.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type HlsPlayerProps = {
  src: string;
  controls?: boolean;
  className?: string;
  fallbackSrc?: string;
  fallbackStartSeconds?: number;
  fallbackEndSeconds?: number;
  onSourceFallback?: () => void;
};

export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(
  function HlsPlayer(
    {
      src,
      controls = true,
      className,
      fallbackSrc,
      fallbackStartSeconds,
      fallbackEndSeconds,
      onSourceFallback,
    },
    forwardedRef,
  ) {
    const ref = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const fallbackActiveRef = useRef(false);
    const fallbackCallbackRef = useRef(onSourceFallback);
    const [failed, setFailed] = useState(false);
    const [usingFallback, setUsingFallback] = useState(false);
    const [ready, setReady] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const canUseFallback =
      src.startsWith("https://stream.videodb.io/") && Boolean(fallbackSrc);
    fallbackCallbackRef.current = onSourceFallback;
    useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement);

    const activateFallback = useCallback(() => {
      const video = ref.current;
      if (
        !video ||
        !canUseFallback ||
        !fallbackSrc ||
        fallbackActiveRef.current
      ) {
        return false;
      }
      const shouldResume = !video.paused || video.currentTime > 0;
      fallbackActiveRef.current = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const start = Math.max(0, fallbackStartSeconds ?? 0);
      const end =
        fallbackEndSeconds && fallbackEndSeconds > start
          ? `,${fallbackEndSeconds}`
          : "";
      video.src = `${fallbackSrc}#t=${start}${end}`;
      if (shouldResume) {
        video.addEventListener(
          "canplay",
          () => void video.play().catch(() => undefined),
          { once: true },
        );
      }
      video.load();
      setUsingFallback(true);
      setFailed(false);
      fallbackCallbackRef.current?.();
      return true;
    }, [
      canUseFallback,
      fallbackEndSeconds,
      fallbackSrc,
      fallbackStartSeconds,
    ]);

    useEffect(() => {
      const video = ref.current;
      if (!video || !src) return;
      fallbackActiveRef.current = false;
      setFailed(false);
      setReady(false);
      setUsingFallback(false);
      const playbackSrc = src.startsWith("https://stream.videodb.io/")
        ? `/api/media/proxy?url=${encodeURIComponent(src)}`
        : src;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startFragPrefetch: true,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(playbackSrc));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (!activateFallback()) setFailed(true);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            if (!activateFallback()) setFailed(true);
          }
        });
        hls.attachMedia(video);
        return () => {
          hls.destroy();
          if (hlsRef.current === hls) hlsRef.current = null;
          video.removeAttribute("src");
          video.load();
        };
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playbackSrc;
      }
    }, [activateFallback, retryKey, src]);

    return (
      <div className="hls-player-wrap">
        {!ready && !failed ? (
          <div className="hls-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            Preparing the reviewed clip
          </div>
        ) : null}
        <video
          ref={ref}
          aria-label="Educational video"
          className={className}
          controls={controls}
          onError={() => {
            if (!activateFallback()) setFailed(true);
          }}
          onLoadedData={() => {
            setFailed(false);
            setReady(true);
          }}
          onLoadedMetadata={(event) => {
            if (
              usingFallback &&
              fallbackStartSeconds &&
              event.currentTarget.currentTime < fallbackStartSeconds
            ) {
              event.currentTarget.currentTime = fallbackStartSeconds;
            }
          }}
          onTimeUpdate={(event) => {
            if (
              usingFallback &&
              fallbackEndSeconds &&
              event.currentTarget.currentTime >= fallbackEndSeconds
            ) {
              event.currentTarget.pause();
            }
          }}
          playsInline
          preload="metadata"
        >
          Your browser does not support HLS video.
        </video>
        {usingFallback ? (
          <span className="sr-only" role="status">
            Playing the reviewed source clip because the stitched stream paused.
          </span>
        ) : null}
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
