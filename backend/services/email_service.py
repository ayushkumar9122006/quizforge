import asyncio
import smtplib
import ssl
import socket
from typing import Tuple
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import httpx
from database.config import settings


def _mask_email(email: str) -> str:
    """Mask email for privacy in logs, e.g. user@example.com -> u***r@example.com"""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


async def _send_resend_async(to_email: str, subject: str, text_body: str, html_body: str) -> Tuple[bool, str]:
    """
    Sends email via Resend HTTPS REST API (https://api.resend.com/emails).
    Returns (success: bool, error_description: str).
    Never logs or leaks the API key, OTP, or sensitive email contents.
    """
    if not settings.resend_api_key:
        return False, "RESEND_API_KEY is not configured"

    from_addr = settings.email_from or "onboarding@resend.dev"
    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "text": text_body,
        "html": html_body,
    }
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key.strip()}",
        "Content-Type": "application/json",
    }
    masked = _mask_email(to_email)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post("https://api.resend.com/emails", json=payload, headers=headers)

        if resp.status_code in (200, 201):
            try:
                data = resp.json()
                email_id = data.get("id", "ok")
            except Exception:
                email_id = "ok"
            print(f"[EMAIL SERVICE] Successfully delivered OTP email to {masked} via Resend API (id: {email_id})")
            return True, ""

        # Handle specific Resend HTTP status codes
        error_detail = "Resend API error"
        try:
            err_json = resp.json()
            error_detail = err_json.get("message") or err_json.get("name") or str(err_json)
        except Exception:
            error_detail = resp.text[:200]

        err_msg = f"Resend API error ({resp.status_code}): {error_detail}"
        print(f"[EMAIL SERVICE ERROR] {err_msg} for recipient {masked}")
        return False, err_msg

    except httpx.TimeoutException:
        err = "Resend API connection timed out after 15s"
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err
    except httpx.NetworkError as exc:
        err = f"Resend API network error: {type(exc).__name__}"
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err
    except Exception as exc:
        err = f"Resend API unexpected error: {type(exc).__name__} - {exc}"
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err


def _send_smtp_sync(to_email: str, subject: str, text_body: str, html_body: str) -> Tuple[bool, str]:
    """
    Synchronous SMTP email sender.
    Returns (success: bool, error_description: str).
    Never logs or leaks credentials.
    """
    if not settings.smtp_host:
        return False, "SMTP_HOST is not configured"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email or "noreply@quizee.com"
    msg["To"] = to_email

    part1 = MIMEText(text_body, "plain", "utf-8")
    part2 = MIMEText(html_body, "html", "utf-8")
    msg.attach(part1)
    msg.attach(part2)

    timeout = 15
    masked = _mask_email(to_email)
    try:
        if settings.smtp_port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=timeout) as server:
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(msg["From"], [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout) as server:
                server.ehlo()
                if settings.smtp_use_tls:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(msg["From"], [to_email], msg.as_string())
        return True, ""
    except smtplib.SMTPAuthenticationError as exc:
        err = f"SMTP Authentication failed (code {exc.smtp_code}). Verify SMTP_USERNAME and Google App Password."
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err
    except smtplib.SMTPConnectError as exc:
        err = f"SMTP Connection failed to {settings.smtp_host}:{settings.smtp_port}."
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err
    except (socket.timeout, TimeoutError):
        err = f"SMTP Connection timed out after {timeout}s connecting to {settings.smtp_host}:{settings.smtp_port}."
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err
    except Exception as exc:
        err = f"SMTP delivery error: {type(exc).__name__} - {exc}"
        print(f"[EMAIL SERVICE ERROR] {err} for recipient {masked}")
        return False, err


async def send_otp_email(to_email: str, name: str, otp: str, role: str) -> bool:
    """
    Sends password recovery OTP to the user's email address.
    If SMTP is not configured, logs to console for local testing.
    """
    role_label = "Administrator" if role == "admin" else "Student"
    subject = f"Your QuiZee {role_label} Password Reset Code: {otp}"
    expire_min = settings.otp_expire_minutes

    text_body = f"""Hello {name or role_label},

We received a request to reset your password for your QuiZee {role_label} account ({to_email}).

Your verification code is: {otp}

This code is valid for {expire_min} minutes. Do not share this code with anyone.
If you did not request this, you can safely ignore this email.

— The QuiZee Team
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QuiZee Password Reset</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px 10px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">QuiZee</h1>
      <p style="color: #e0e7ff; margin: 6px 0 0; font-size: 14px; font-weight: 500;">{role_label} Password Recovery</p>
    </div>
    <div style="padding: 32px 28px;">
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 18px;">
        Hello <strong>{name or role_label}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        We received a request to reset the password for your QuiZee account (<strong>{to_email}</strong>). Use the verification code below to proceed with resetting your password:
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <div style="display: inline-block; background: #f1f5f9; border: 2px dashed #6366f1; border-radius: 12px; padding: 14px 28px;">
          <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #4338ca;">{otp}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0 0; font-weight: 600;">Valid for {expire_min} minutes · Single use only</p>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 24px 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        <strong>Security Tip:</strong> Never share this code with anyone. QuiZee representatives will never ask for your verification code or password.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        If you did not request a password reset, please ignore this email or review your account security.
      </p>
    </div>
  </div>
</body>
</html>
"""

    masked = _mask_email(to_email)

    # 1. Primary: Resend HTTPS API
    if settings.resend_api_key:
        success, err = await _send_resend_async(to_email, subject, text_body, html_body)
        if success:
            return True
        if settings.is_production:
            print(f"[EMAIL SERVICE ERROR] Production Resend delivery to {masked} failed: {err}")
            return False
        print(f"[EMAIL SERVICE] Local Resend delivery failed ({err}), falling back to console mock.")

    # 2. Secondary / Legacy: SMTP (if configured and Resend not configured)
    elif settings.smtp_host:
        success, err = await asyncio.to_thread(_send_smtp_sync, to_email, subject, text_body, html_body)
        if success:
            print(f"[EMAIL SERVICE] Successfully delivered OTP email to {masked} via SMTP ({settings.smtp_host}:{settings.smtp_port})")
            return True
        if settings.is_production:
            print(f"[EMAIL SERVICE ERROR] Production SMTP delivery to {masked} failed: {err}")
            return False
        print(f"[EMAIL SERVICE] Local SMTP delivery attempt failed ({err}), falling back to console mock.")

    # 3. Production with neither configured:
    if settings.is_production:
        print(f"[EMAIL SERVICE ERROR] Production mode is active but neither RESEND_API_KEY nor SMTP_HOST is configured. Delivery aborted for {masked}.")
        return False

    # 4. Non-Production / Local Development Fallback Mock
    print(f"\n{'='*70}")
    print(f"[QUIZEE EMAIL SERVICE - DEVELOPMENT MODE]")
    print(f"To: {to_email} ({name or role_label})")
    print(f"Role: {role_label}")
    print(f"Subject: {subject}")
    print(f"VERIFICATION CODE (OTP): >>> {otp} <<<")
    print(f"Expires in: {expire_min} minutes")
    print(f"{'='*70}\n")
    return True
