"use client";

import { useEffect } from "react";

type TikTokWindow = Window & {
  ttq?: {
    track?: (eventName: string, payload?: Record<string, unknown>) => void;
  };
};

export default function TikTokViewContent({
  contentId,
  contentName,
  value,
  currency = "TND",
}: {
  contentId: string;
  contentName: string;
  value: number;
  currency?: string;
}) {
  useEffect(() => {
    const ttq = (window as TikTokWindow).ttq;
    ttq?.track?.("ViewContent", {
      content_id: contentId,
      content_name: contentName,
      content_type: "product",
      value,
      currency,
    });
  }, [contentId, contentName, currency, value]);

  return null;
}
