"use client";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".oga", ".aac", ".flac"];

export function getMediaKind(url: string) {
  const normalized = url.split("?")[0].toLowerCase();
  if (VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return "video";
  if (AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return "audio";
  return "image";
}

export default function MediaRenderer({
  src,
  alt,
  className,
  imageClassName,
  videoClassName,
  audioClassName,
  showControls = false,
}: {
  src: string;
  alt: string;
  className: string;
  imageClassName?: string;
  videoClassName?: string;
  audioClassName?: string;
  showControls?: boolean;
}) {
  const kind = getMediaKind(src);

  if (kind === "video") {
    return (
      <video
        src={src}
        aria-label={alt}
        className={videoClassName || className}
        autoPlay
        loop
        muted
        playsInline
        controls={showControls}
        preload="metadata"
      />
    );
  }

  if (kind === "audio") {
    return (
      <audio
        src={src}
        aria-label={alt}
        className={audioClassName || className}
        controls
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={imageClassName || className}
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  );
}
