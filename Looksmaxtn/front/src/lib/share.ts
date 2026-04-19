"use client";

import { withAuthRequest } from "@/lib/authClient";

export interface ShareResult {
  shareUrl: string;
  copied: boolean;
}

export async function copyShareLink(text: string) {
  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path below.
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (copied) return true;
  } catch {
    document.body.removeChild(textarea);
  }

  return false;
}

export async function shareOutfit(id: string): Promise<ShareResult> {
  const response = await fetch(`/api/outfits/${id}/share`, withAuthRequest({ method: "POST" }));
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to share outfit.");
  }

  const shareUrl = String(data.shareUrl || "");
  const copied = await copyShareLink(shareUrl);
  return { shareUrl, copied };
}
