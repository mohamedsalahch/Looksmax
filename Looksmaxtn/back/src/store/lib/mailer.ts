import nodemailer from "nodemailer";

function getMailConfig() {
  const host = process.env.SMTP_HOST || "mail.privateemail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASSWORD || "";
  const from = process.env.SMTP_FROM || user;

  if (!user || !pass || !from) {
    throw new Error("SMTP configuration is incomplete");
  }

  return { host, port, secure, auth: { user, pass }, from };
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
  const { host, port, secure, auth, from } = getMailConfig();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });

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
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
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
            <a href="${verificationUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              Verify Email
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:10px">
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
  const { host, port, secure, auth, from } = getMailConfig();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });

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
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
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
            <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              Reset Password
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:10px">
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
  const { host, port, secure, auth, from } = getMailConfig();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });

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
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccd;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#1a1a1a">
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
            <a href="${orderUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">
              View Order
            </a>
          </div>

          <div style="padding:16px 18px;background:#f8f5ef;border:1px solid #eee0cc;border-radius:10px">
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
