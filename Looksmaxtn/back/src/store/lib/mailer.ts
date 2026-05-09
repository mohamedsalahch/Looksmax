import nodemailer from "nodemailer";

function cleanEnvValue(value: string | undefined, fallback = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function getMailConfig() {
  const host = cleanEnvValue(process.env.SMTP_HOST, "mail.privateemail.com");
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const user = cleanEnvValue(process.env.SMTP_USER);
  const pass = cleanEnvValue(process.env.SMTP_PASSWORD);
  const from = cleanEnvValue(process.env.SMTP_FROM, user);

  if (!user || !pass || !from) {
    throw new Error("SMTP configuration is incomplete");
  }

  return { host, port, secure, auth: { user, pass }, from };
}

function createTransporter() {
  const { host, port, secure, auth, from } = getMailConfig();
  console.info("[mail] smtp config", {
    host,
    port,
    secure,
    user: auth.user,
    from,
  });

  return {
    from,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth,
    }),
  };
}

export async function sendVerificationEmail({
  to,
  name,
  verificationUrl,
}: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  const { from, transporter } = createTransporter();

  const subject = "Verify your LOOKSMAX account";
  const text = [
    `Hi ${name},`,
    "",
    "Verify your LOOKSMAX account by opening this link:",
    verificationUrl,
    "",
    "This link expires in 24 hours.",
  ].join("\n");

  const html = `
    <div style="background:#f6f1e7;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:0;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="padding:28px 28px 20px;border-bottom:1px solid #eee3d1">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6b6258">LOOKSMAX</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700">Verify your email address</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#3a332d">
            Your LOOKSMAX account is almost ready. Confirm this email address so you can sign in and continue using your profile.
          </p>

          <div style="margin:28px 0">
            <a href="${verificationUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:0;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              Verify Email
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Link expires</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d">This verification link is valid for 24 hours.</p>
          </div>

          <p style="margin:22px 0 8px;font-size:12px;color:#6b6258">If the button does not work, paste this URL into your browser:</p>
          <p style="margin:0;font-size:12px;word-break:break-all;line-height:1.6;color:#3a332d">${verificationUrl}</p>
        </div>

        <div style="padding:18px 28px 24px;border-top:1px solid #eee3d1;font-size:11px;line-height:1.6;color:#847b70">
          If you did not create a LOOKSMAX account, you can ignore this message.
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const { from, transporter } = createTransporter();

  const subject = "Reset your LOOKSMAX password";
  const text = [
    `Hi ${name},`,
    "",
    "Reset your LOOKSMAX password by opening this link:",
    resetUrl,
    "",
    "This link expires in 1 hour.",
  ].join("\n");

  const html = `
    <div style="background:#f6f1e7;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:0;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="padding:28px 28px 20px;border-bottom:1px solid #eee3d1">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6b6258">LOOKSMAX</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700">Reset your password</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#3a332d">
            We received a request to reset your LOOKSMAX password. Use the button below to create a new password.
          </p>

          <div style="margin:28px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:0;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              Reset Password
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Link expires</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d">This password reset link is valid for 1 hour.</p>
          </div>

          <p style="margin:22px 0 8px;font-size:12px;color:#6b6258">If the button does not work, paste this URL into your browser:</p>
          <p style="margin:0;font-size:12px;word-break:break-all;line-height:1.6;color:#3a332d">${resetUrl}</p>
        </div>

        <div style="padding:18px 28px 24px;border-top:1px solid #eee3d1;font-size:11px;line-height:1.6;color:#847b70">
          If you did not request this reset, you can ignore this message.
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

type OrderStatus = "processing" | "confirmed" | "shipping" | "delivered" | "canceled" | "returned";

function getOrderStatusCopy(orderStatus: OrderStatus) {
  switch (orderStatus) {
    case "processing":
      return {
        subject: "Your LOOKSMAX order was received",
        title: "Order received",
        body: "We received your order and our team will review it before the next step.",
        detail: "We will contact you to confirm the order details if needed.",
      };
    case "confirmed":
      return {
        subject: "Your LOOKSMAX order is confirmed",
        title: "Order confirmed",
        body: "Your order has been confirmed and is ready for the next stage.",
        detail: "We have completed the confirmation step with you.",
      };
    case "shipping":
      return {
        subject: "Your LOOKSMAX order is on the way",
        title: "On the way",
        body: "Your order has been shipped and is currently on the way to you.",
        detail: "Please keep your phone available if the delivery team needs to reach you.",
      };
    case "delivered":
      return {
        subject: "Your LOOKSMAX order was delivered",
        title: "Delivered",
        body: "Your order has been delivered successfully.",
        detail: "Thank you for shopping with LOOKSMAX.",
      };
    case "returned":
      return {
        subject: "Your LOOKSMAX order was returned",
        title: "Returned",
        body: "Your order has been marked as returned.",
        detail: "If you need help with this order, reply to this email.",
      };
    case "canceled":
    default:
      return {
        subject: "Your LOOKSMAX order was canceled",
        title: "Canceled",
        body: "Your order has been canceled.",
        detail: "If you did not request this, please contact support.",
      };
  }
}

export async function sendOrderStatusEmail({
  to,
  name,
  orderNumber,
  orderStatus,
  orderUrl,
}: {
  to: string;
  name: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  orderUrl: string;
}) {
  const { from, transporter } = createTransporter();

  const copy = getOrderStatusCopy(orderStatus);
  const text = [
    `Hi ${name},`,
    "",
    `${copy.title} for order ${orderNumber}.`,
    copy.body,
    copy.detail,
    "",
    `View your order: ${orderUrl}`,
  ].join("\n");

  const html = `
    <div style="background:#f6f1e7;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:0;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="padding:28px 28px 20px;border-bottom:1px solid #eee3d1">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6b6258">LOOKSMAX</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700">${copy.title}</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3a332d">
            ${copy.body}
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#6b6258">
            Order <strong style="color:#1a1a1a">${orderNumber}</strong>
          </p>

          <div style="margin:28px 0">
            <a href="${orderUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:0;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              View Order
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Update</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d">${copy.detail}</p>
          </div>

          <p style="margin:22px 0 8px;font-size:12px;color:#6b6258">If the button does not work, paste this URL into your browser:</p>
          <p style="margin:0;font-size:12px;word-break:break-all;line-height:1.6;color:#3a332d">${orderUrl}</p>
        </div>

        <div style="padding:18px 28px 24px;border-top:1px solid #eee3d1;font-size:11px;line-height:1.6;color:#847b70">
          If you need help with your order, reply to this email and our team will assist you.
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: copy.subject,
    text,
    html,
  });
}

export async function sendStoreOwnerOrderCreatedEmail({
  to,
  name,
  orderNumber,
  orderUrl,
  customerName,
  customerPhone,
  shippingCity,
  items,
  totalPrice,
}: {
  to: string;
  name: string;
  orderNumber: string;
  orderUrl: string;
  customerName: string;
  customerPhone: string;
  shippingCity: string;
  items: Array<{ name: string; quantity: number; size?: string; color?: string; price: number }>;
  totalPrice: number;
}) {
  const { from, transporter } = createTransporter();
  const subject = `New LOOKSMAX order ${orderNumber}`;
  const itemLines = items.map((item) => {
    const details = [item.size ? `Size: ${item.size}` : "", item.color ? `Color: ${item.color}` : ""]
      .filter(Boolean)
      .join(", ");
    return `- ${item.name} x${item.quantity}${details ? ` (${details})` : ""} - ${(item.price * item.quantity).toFixed(2)} TND`;
  });
  const itemRows = items
    .map((item) => {
      const details = [item.size ? `Size: ${item.size}` : "", item.color ? `Color: ${item.color}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee3d1">
            <p style="margin:0;font-size:14px;color:#1a1a1a">${item.name}</p>
            ${details ? `<p style="margin:4px 0 0;font-size:12px;color:#6b6258">${details}</p>` : ""}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee3d1;text-align:center;font-size:14px;color:#3a332d">${item.quantity}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee3d1;text-align:right;font-size:14px;color:#3a332d">${(item.price * item.quantity).toFixed(2)} TND</td>
        </tr>
      `;
    })
    .join("");

  const text = [
    `Hi ${name},`,
    "",
    `You received a new order on LOOKSMAX: ${orderNumber}.`,
    "",
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    `City: ${shippingCity}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `Store total: ${totalPrice.toFixed(2)} TND`,
    `View order: ${orderUrl}`,
  ].join("\n");

  const html = `
    <div style="background:#f6f1e7;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:0;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="padding:28px 28px 20px;border-bottom:1px solid #eee3d1">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6b6258">LOOKSMAX</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700">New order received</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3a332d">
            You received a new LOOKSMAX order. Please review it from your store owner dashboard.
          </p>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Order</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d"><strong style="color:#1a1a1a">${orderNumber}</strong></p>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#3a332d">Customer: ${customerName}</p>
            <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#3a332d">Phone: ${customerPhone}</p>
            <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#3a332d">City: ${shippingCity}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <thead>
              <tr>
                <th style="padding:0 0 8px;text-align:left;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6258">Item</th>
                <th style="padding:0 0 8px;text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6258">Qty</th>
                <th style="padding:0 0 8px;text-align:right;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6258">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <p style="margin:0 0 22px;text-align:right;font-size:15px;color:#1a1a1a">
            Store total: <strong>${totalPrice.toFixed(2)} TND</strong>
          </p>

          <div style="margin:28px 0">
            <a href="${orderUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:0;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              View Order
            </a>
          </div>
        </div>

        <div style="padding:18px 28px 24px;border-top:1px solid #eee3d1;font-size:11px;line-height:1.6;color:#847b70">
          This notification was sent because one or more products in the order belong to your store.
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export async function sendStoreApplicationStatusEmail({
  to,
  name,
  email,
  status,
  password,
  adminUrl,
}: {
  to: string;
  name: string;
  email?: string;
  status: "approved" | "rejected";
  password?: string;
  adminUrl?: string;
}) {
  const { from, transporter } = createTransporter();
  const approved = status === "approved";
  const subject = approved
    ? "Your LOOKSMAX store request was approved"
    : "Your LOOKSMAX store request was rejected";
  const title = approved ? "Store request approved" : "Store request rejected";
  const body = approved
    ? "Your request to create your own store on LOOKSMAX has been approved."
    : "Your request to create your own store on LOOKSMAX has been reviewed and rejected.";
  const detail = approved
    ? "Use the admin link and password below to connect to your store owner account."
    : "If you believe this was a mistake or want to submit updated information, reply to this email.";

  const text = [
    `Hi ${name},`,
    "",
    body,
    detail,
    ...(approved && password && adminUrl
      ? ["", `Admin URL: ${adminUrl}`, `Email: ${email || to}`, `Password: ${password}`]
      : []),
  ].join("\n");

  const html = `
    <div style="background:#f6f1e7;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:0;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="padding:28px 28px 20px;border-bottom:1px solid #eee3d1">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6b6258">LOOKSMAX</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700">${title}</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3a332d">
            ${body}
          </p>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Update</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d">${detail}</p>
          </div>

          ${
            approved && password && adminUrl
              ? `
                <div style="margin-top:18px;padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:0">
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6258">Store Owner Access</p>
                  <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3a332d">Admin URL: <a href="${adminUrl}" style="color:#111">${adminUrl}</a></p>
                  <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3a332d">Email: <strong style="color:#1a1a1a">${email || to}</strong></p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#3a332d">Password: <strong style="color:#1a1a1a">${password}</strong></p>
                </div>
              `
              : ""
          }
        </div>

        <div style="padding:18px 28px 24px;border-top:1px solid #eee3d1;font-size:11px;line-height:1.6;color:#847b70">
          Thank you for your interest in LOOKSMAX.
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
