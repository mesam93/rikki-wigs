# Client-owned appointment email setup

The appointment email feature is provider-independent and is not connected to
the developer's Replit account. The client owns the email account, sending
domain, credentials, and billing.

## Before activation

1. The client creates an account with an SMTP provider such as Resend, Postmark,
   SendGrid, Mailgun, or another provider that supports authenticated SMTP.
2. The client adds and verifies their sending domain in that provider.
3. The client chooses a sender, for example
   `Rikki Wigs <appointments@rikkiwigs.com>`, and a reply-to address.
4. In the client's copy of the project, add the values below as private
   deployment secrets. Do not put them in source code, commit them, or send them
   in chat.

## Required settings

| Setting | Purpose | Example |
| --- | --- | --- |
| `EMAIL_DELIVERY_MODE` | `disabled`, `test`, or `smtp` | `smtp` |
| `SMTP_HOST` | Provider SMTP server | `smtp.example.com` |
| `SMTP_PORT` | Provider SMTP port | `587` |
| `SMTP_SECURE` | Use implicit TLS, normally for port 465 | `false` |
| `SMTP_USERNAME` | Provider-issued SMTP username | Provider supplied |
| `SMTP_PASSWORD` | Provider-issued SMTP password/API credential | Private secret |
| `EMAIL_FROM` | Verified sender identity | `Rikki Wigs <appointments@rikkiwigs.com>` |
| `EMAIL_REPLY_TO` | Address that receives customer replies | Client supplied |
| `EMAIL_TIMEZONE` | Timezone used to format appointment dates | `America/New_York` |

For port 587, use `SMTP_SECURE=false`; the app upgrades the connection with
STARTTLS. For port 465, use `SMTP_SECURE=true`.

## Delivery modes

- `disabled`: default. Appointments save, and notification events are recorded
  as disabled. No network connection is opened.
- `test`: templates and triggers run, but no network connection is opened and
  no customer receives an email.
- `smtp`: real delivery. The owner settings screen reports whether all required
  SMTP settings are present.

Changing from disabled or test mode to SMTP does not send historical messages.
Only new appointment events send after activation.

## Activation checklist

Before real delivery is enabled, complete the separate appointment-management
privacy work so only the client can list or change appointments. Until that
access control is active, keep `EMAIL_DELIVERY_MODE` set to `disabled` or `test`.

1. Add the client's settings as private secrets.
2. Keep `EMAIL_DELIVERY_MODE=test` and exercise each appointment event.
3. Change `EMAIL_DELIVERY_MODE=smtp`.
4. Submit one appointment using an address controlled by the client.
5. Approve, reschedule, cancel, and complete test appointments as applicable.
6. Confirm sender name, reply behavior, inbox placement, and delivery logs.