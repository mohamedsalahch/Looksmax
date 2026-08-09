import StoreApplication from "@/store/models/StoreApplication";

// WhatsApp Business Cloud API (Meta Graph API) notifications.
// Best-effort by design: every sender resolves without throwing so a WhatsApp
// outage can never block an order or an admin action.

function cleanEnvValue(value: string | undefined, fallback = ""): string {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim() || fallback;
  }
  return raw;
}

function getWhatsAppConfig() {
  const token = cleanEnvValue(process.env.WHATSAPP_API_TOKEN);
  const phoneNumberId = cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiVersion: cleanEnvValue(process.env.WHATSAPP_API_VERSION, "v21.0"),
    adminPhone: cleanEnvValue(process.env.WHATSAPP_ADMIN_PHONE, "+21652461061"),
    // Optional pre-approved template wrapper for business-initiated messages
    // outside the 24h customer-service window. The template must contain a
    // single {{1}} body parameter that receives the full message text.
    templateName: cleanEnvValue(process.env.WHATSAPP_TEMPLATE_NAME),
    templateLang: cleanEnvValue(process.env.WHATSAPP_TEMPLATE_LANG, "en"),
  };
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

// Normalizes free-text phone input to Graph API format (digits only, with
// country code). Tunisian local numbers are 8 digits; "+216", "00216" and
// bare "216" prefixes are all accepted.
export function normalizeWhatsAppPhone(raw: string): string | null {
  let digits = String(raw || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");
  if (/^216\d{8}$/.test(digits)) return digits;
  if (/^\d{8}$/.test(digits)) return `216${digits}`;
  // Other international numbers: accept plausible E.164 lengths as-is.
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

export async function getStoreOwnerWhatsAppPhone(email: string): Promise<string | null> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const application = await StoreApplication.findOne({ email: normalizedEmail })
    .sort({ createdAt: -1 })
    .select("phoneNumber")
    .lean();
  return normalizeWhatsAppPhone(String(application?.phoneNumber || ""));
}

export async function sendWhatsAppText(toRaw: string, body: string): Promise<boolean> {
  const config = getWhatsAppConfig();
  if (!config) return false;
  const to = normalizeWhatsAppPhone(toRaw);
  if (!to) {
    console.error("[whatsapp] unusable phone number:", toRaw);
    return false;
  }

  const payload = config.templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: config.templateName,
          language: { code: config.templateLang },
          components: [
            { type: "body", parameters: [{ type: "text", text: body }] },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body, preview_url: false },
      };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[whatsapp] send failed (${response.status}) to ${to}:`, errorBody);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[whatsapp] send error:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

type OrderItemLine = {
  name: string;
  price: number;
  size?: string;
  color?: string | null;
  quantity: number;
};

function formatTnd(amount: number): string {
  return `${amount.toFixed(3)} TND`;
}

function formatItemLines(items: OrderItemLine[]): string {
  return items
    .map((item) => {
      const variant = [item.size, item.color].filter(Boolean).join("/");
      const variantLabel = variant ? ` (${variant})` : "";
      return `• ${item.quantity}× ${item.name}${variantLabel} — ${formatTnd(item.price * item.quantity)}`;
    })
    .join("\n");
}

export async function sendStoreOwnerNewOrderWhatsApp(params: {
  phone: string;
  storeName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingCity: string;
  items: OrderItemLine[];
  totalPrice: number;
  orderUrl: string;
}): Promise<boolean> {
  const customer = params.customerPhone
    ? `${params.customerName} (${params.customerPhone})`
    : params.customerName;
  const body = [
    `🛍️ LOOKSMAX — New order #${params.orderNumber}`,
    `Store: ${params.storeName}`,
    `Customer: ${customer}`,
    params.shippingCity ? `City: ${params.shippingCity}` : "",
    "",
    formatItemLines(params.items),
    "",
    `Your total: ${formatTnd(params.totalPrice)}`,
    `Manage: ${params.orderUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  return sendWhatsAppText(params.phone, body);
}

export async function sendAdminNewOrderWhatsApp(params: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingCity: string;
  totalPrice: number;
  storeSummaries: { storeName: string; itemCount: number }[];
  orderUrl: string;
}): Promise<boolean> {
  const config = getWhatsAppConfig();
  if (!config) return false;
  const customer = params.customerPhone
    ? `${params.customerName} (${params.customerPhone})`
    : params.customerName;
  const stores = params.storeSummaries.length
    ? params.storeSummaries
        .map((store) => `• ${store.storeName} — ${store.itemCount} item(s)`)
        .join("\n")
    : "";
  const body = [
    `📦 LOOKSMAX — New order #${params.orderNumber}`,
    `Customer: ${customer}`,
    params.shippingCity ? `City: ${params.shippingCity}` : "",
    `Total: ${formatTnd(params.totalPrice)}`,
    stores ? `Stores:\n${stores}` : "",
    `Manage: ${params.orderUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  return sendWhatsAppText(config.adminPhone, body);
}

export async function sendProductApprovalWhatsApp(params: {
  phone: string;
  productName: string;
  status: "approved" | "rejected";
  reason?: string;
  productUrl: string;
}): Promise<boolean> {
  const body =
    params.status === "approved"
      ? [
          `✅ LOOKSMAX — Product approved`,
          `"${params.productName}" is now live in your store.`,
          `View: ${params.productUrl}`,
        ].join("\n")
      : [
          `❌ LOOKSMAX — Product rejected`,
          `"${params.productName}" was not approved.`,
          params.reason ? `Reason: ${params.reason}` : "",
          `Details: ${params.productUrl}`,
        ]
          .filter((line) => line !== "")
          .join("\n");
  return sendWhatsAppText(params.phone, body);
}
