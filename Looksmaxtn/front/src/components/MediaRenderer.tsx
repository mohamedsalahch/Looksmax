"use client";

import Image from "next/image";
import { isOptimizableImageSrc } from "@/lib/imageOptimization";

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
  priority = false,
  sizes = "100vw",
}: {
  src: string;
  alt: string;
  className: string;
  imageClassName?: string;
  videoClassName?: string;
  audioClassName?: string;
  showControls?: boolean;
  /** Set for the LCP image only — everything else lazy-loads. */
  priority?: boolean;
  /** Rendered slot width hint so the optimizer serves right-sized variants. */
  sizes?: string;
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

  // width/height of 0 keeps layout fully CSS-driven (same as the previous
  // plain <img>) while still emitting a responsive srcset from `sizes`.
  return (
    <Image
      src={src}
      alt={alt}
      width={0}
      height={0}
      sizes={sizes}
      className={imageClassName || className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      unoptimized={!isOptimizableImageSrc(src)}
    />
  );
}
