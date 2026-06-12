"""
Tanda 7E — Envío de emails transaccionales (verificación de registro y
recuperación de contraseña).

Sin dependencias nuevas: smtplib + email.message de la librería estándar
contra el relay SMTP de Brevo (300 emails/día gratis). Credenciales por
variables de entorno (.env en dev, Environment en Render):

    MAIL_SMTP_HOST=smtp-relay.brevo.com
    MAIL_SMTP_PORT=587
    MAIL_SMTP_USER=<login SMTP de Brevo>
    MAIL_SMTP_PASSWORD=<clave SMTP de Brevo>
    MAIL_FROM=SideQuest <tu-email-verificado-en-brevo>

Si faltan variables, mail_configured() devuelve False y los flujos
degradan con elegancia (el registro funciona sin email; la recuperación
devuelve 503 explicando que no está configurada).

El envío corre en un thread daemon: el SMTP puede tardar 1-2 s y no
queremos bloquear la request HTTP (ni que un fallo del relay rompa un
registro). Mismo espíritu best-effort que emit_to_user en sockets.py.
"""
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage


def mail_configured():
    return all(os.getenv(k) for k in (
        "MAIL_SMTP_HOST", "MAIL_SMTP_USER", "MAIL_SMTP_PASSWORD", "MAIL_FROM",
    ))


def frontend_base_url():
    """URL pública del frontend para construir los links de los emails.

    Mismo criterio de autodetección que sockets.py: FRONTEND_URL manda
    si está definida; si no, el dominio forwarded del Codespace (puerto
    3000) en dev, o RENDER_EXTERNAL_URL en producción (front y API
    comparten origen en Render).
    """
    explicit = os.getenv("FRONTEND_URL")
    if explicit:
        return explicit.rstrip("/")
    codespace = os.getenv("CODESPACE_NAME")
    fwd_domain = os.getenv(
        "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
    if codespace:
        return "https://{}-3000.{}".format(codespace, fwd_domain)
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    if render_url:
        return render_url.rstrip("/")
    return "http://localhost:3000"


def _send_sync(to_email, subject, html_body, text_body):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("MAIL_FROM")
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    host = os.getenv("MAIL_SMTP_HOST")
    port = int(os.getenv("MAIL_SMTP_PORT", "587"))
    user = os.getenv("MAIL_SMTP_USER")
    password = os.getenv("MAIL_SMTP_PASSWORD")

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)


def send_email_async(to_email, subject, html_body, text_body):
    """Best-effort en thread daemon — un fallo del SMTP jamás rompe la
    request que lo disparó (el error queda en el log del server)."""
    if not mail_configured():
        return False

    def _worker():
        try:
            _send_sync(to_email, subject, html_body, text_body)
        except Exception as exc:  # noqa: BLE001 — log-and-continue a propósito
            print("[mailer] send failed to {}: {}".format(to_email, exc))

    threading.Thread(target=_worker, daemon=True).start()
    return True


# ── Plantillas ───────────────────────────────────────────────
# HTML mínimo inline-styled (los clientes de correo ignoran <style>),
# paleta coherente con la app (fondo oscuro, acento índigo).

def _layout(title, body_html, cta_label, cta_url):
    return """\
<div style="background:#0b0d12;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#161922;border:1px solid #262a36;border-radius:14px;padding:28px;color:#e9ecef;">
    <h2 style="margin:0 0 6px;color:#ffffff;">{title}</h2>
    {body}
    <a href="{url}" style="display:block;text-align:center;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;margin:22px 0 8px;">{cta}</a>
    <p style="color:#6c757d;font-size:12px;margin:14px 0 0;">
      If the button doesn't work, copy this link into your browser:<br/>
      <span style="color:#adb5bd;word-break:break-all;">{url}</span>
    </p>
  </div>
  <p style="text-align:center;color:#6c757d;font-size:11px;margin-top:14px;">
    SideQuest — you received this email because of an action on your account.
  </p>
</div>""".format(title=title, body=body_html, cta=cta_label, url=cta_url)


def send_verification_email(user, verify_url):
    html = _layout(
        "Confirm your email",
        """<p style="color:#adb5bd;line-height:1.5;">Hi <strong style="color:#fff;">@{u}</strong>,<br/>
        welcome to SideQuest! Click the button below to confirm your email
        address. The link is valid for 3 days.</p>""".format(u=user.username or ""),
        "Confirm my email",
        verify_url,
    )
    text = (
        "Hi @{u},\n\nWelcome to SideQuest! Confirm your email by opening:\n"
        "{url}\n\nThe link is valid for 3 days.".format(
            u=user.username or "", url=verify_url)
    )
    return send_email_async(user.email, "Confirm your SideQuest email", html, text)


def send_password_reset_email(user, reset_url):
    html = _layout(
        "Reset your password",
        """<p style="color:#adb5bd;line-height:1.5;">Hi <strong style="color:#fff;">@{u}</strong>,<br/>
        we received a request to reset your password. Click the button to
        choose a new one. The link is valid for 1 hour.<br/><br/>
        If you didn't request this, you can safely ignore this email —
        your password will not change.</p>""".format(u=user.username or ""),
        "Choose a new password",
        reset_url,
    )
    text = (
        "Hi @{u},\n\nReset your SideQuest password by opening:\n{url}\n\n"
        "The link is valid for 1 hour. If you didn't request this, "
        "ignore this email.".format(u=user.username or "", url=reset_url)
    )
    return send_email_async(user.email, "Reset your SideQuest password", html, text)
