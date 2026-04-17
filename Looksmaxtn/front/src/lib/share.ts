"use client";

import { withAuthRequest } from "@/lib/authClient";

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

  const input = document.createElement("input");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();

  try {
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    if (copied) return true;
  } catch {
    document.body.removeChild(input);
  }

  return false;
}

export async function shareOutfit(id: string) {
  const response = await fetch(`/api/outfits/${id}/share`, withAuthRequest({ method: "POST" }));
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to share outfit.");
  }

  const shareUrl = String(data.shareUrl || "");
  const copied = await copyShareLink(shareUrl);
  return { shareUrl, copied };
}
