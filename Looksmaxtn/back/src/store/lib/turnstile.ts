import type { NextRequest } from "next/server";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  "error-codes"?: string[];
};

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "";
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

export async function verifyTurnstileToken(
  req: NextRequest,
  token: string | undefined,
  expectedAction: string
) {
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) return { ok: true };

  if (!token) {
    return { ok: false, error: "Please complete the security check." };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  const remoteIp = getClientIp(req);
  if (remoteIp) formData.append("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as TurnstileResponse;

    if (!data.success) {
      return { ok: false, error: "Security check failed. Please try again." };
    }

    if (data.action && data.action !== expectedAction) {
      return { ok: false, error: "Security check failed. Please try again." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Security check unavailable. Please try again." };
  }
}
