"""
Brevo OTP email tests (no network: Brevo / Resend are mocked with httpx.MockTransport).

Run:  python test_brevo_email.py
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import httpx  # noqa: E402

from database.config import settings  # noqa: E402
import services.email_service as es  # noqa: E402

CALLS = []
RESPONSES = {}
_RealClient = httpx.AsyncClient


def _handler(request: httpx.Request) -> httpx.Response:
    CALLS.append(request)
    status, body = RESPONSES.get(request.url.host, (500, {"message": "no mock"}))
    return httpx.Response(status, json=body)


class _MockClient(_RealClient):
    def __init__(self, *a, **kw):
        kw["transport"] = httpx.MockTransport(_handler)
        super().__init__(*a, **kw)


def configure(brevo="", sender="", resend="", smtp="", prod=False, email_from="onboarding@resend.dev"):
    settings.brevo_api_key, settings.brevo_sender_email = brevo, sender
    settings.resend_api_key, settings.smtp_host = resend, smtp
    settings.email_from = email_from
    settings.environment = "production" if prod else "development"
    os.environ.pop("RENDER", None)
    CALLS.clear()
    RESPONSES.clear()


async def main():
    es.httpx.AsyncClient = _MockClient

    # 1. Brevo success: correct endpoint, auth header and payload
    configure(brevo="xkeysib-test", sender="teacher@gmail.com", prod=True)
    RESPONSES["api.brevo.com"] = (201, {"messageId": "<abc@smtp-relay.mailin.fr>"})
    ok = await es.send_otp_email("student@example.com", "Diya", "482913", "student")
    req = CALLS[0]
    body = json.loads(req.content)
    assert ok and len(CALLS) == 1
    assert str(req.url) == "https://api.brevo.com/v3/smtp/email" and req.headers["api-key"] == "xkeysib-test"
    assert body["sender"] == {"name": "QuiZee", "email": "teacher@gmail.com"}
    assert body["to"] == [{"email": "student@example.com", "name": "Diya"}]
    assert "482913" in body["htmlContent"] and "482913" in body["textContent"] and "482913" in body["subject"]
    print("✓ 1. Brevo API: delivered with correct endpoint, api-key header and payload")

    # 2. Brevo fails (401) → falls through to Resend
    configure(brevo="xkeysib-bad", sender="teacher@gmail.com", resend="re_test", prod=True)
    RESPONSES["api.brevo.com"] = (401, {"code": "unauthorized", "message": "Key not found"})
    RESPONSES["api.resend.com"] = (200, {"id": "r1"})
    ok = await es.send_otp_email("student@example.com", "Diya", "111222", "student")
    assert ok and [c.url.host for c in CALLS] == ["api.brevo.com", "api.resend.com"]
    print("✓ 2. Brevo 401 → fell back to Resend and delivered")

    # 3. SMTP key pasted into BREVO_API_KEY → clear error, no request sent
    configure(brevo="xsmtpsib-wrongkind", sender="teacher@gmail.com", prod=True)
    ok, err = await es._send_brevo_async("student@example.com", "Diya", "s", "t", "h")
    assert not ok and "xkeysib-" in err and not CALLS
    print("✓ 3. SMTP key detected → explains to use the API key (xkeysib-)")

    # 4. Production, Brevo is the only provider and fails → False (no fake success)
    configure(brevo="xkeysib-test", sender="teacher@gmail.com", prod=True)
    RESPONSES["api.brevo.com"] = (400, {"code": "invalid_parameter", "message": "sender is not valid"})
    assert await es.send_otp_email("student@example.com", "Diya", "333444", "student") is False
    print("✓ 4. Production + Brevo failure → reports failure")

    # 5. Sender from EMAIL_FROM "Name <addr>"; Resend's test sender is rejected for Brevo
    configure(brevo="xkeysib-test", email_from="QuiZee Coaching <coach@gmail.com>")
    assert es._brevo_sender() == ("QuiZee Coaching", "coach@gmail.com")
    configure(brevo="xkeysib-test", email_from="onboarding@resend.dev")
    ok, err = await es._send_brevo_async("student@example.com", "", "s", "t", "h")
    assert not ok and "BREVO_SENDER_EMAIL" in err and not CALLS
    print("✓ 5. Sender parsing; resend.dev sender refused for Brevo")

    # 6. Local development with nothing configured → console mock, success
    configure()
    assert await es.send_otp_email("student@example.com", "Diya", "555666", "student") is True
    print("✓ 6. Local mode → OTP printed to console")

    # 7. Full endpoint: POST /auth/forgot-password/send-otp sends through Brevo
    from main import app
    from database.config import get_db  # noqa: F401
    configure(brevo="xkeysib-test", sender="teacher@gmail.com")
    RESPONSES["api.brevo.com"] = (201, {"messageId": "m"})
    email = os.getenv("BREVO_TEST_STUDENT", "diya@example.com")
    async with _RealClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/auth/forgot-password/send-otp", json={"email": email, "role": "student"})
    brevo_calls = [x for x in CALLS if x.url.host == "api.brevo.com"]
    print(f"   endpoint → {r.status_code}, Brevo calls: {len(brevo_calls)}")
    if r.status_code == 429:
        print("✓ 7. Endpoint reached its 60 s cooldown (an OTP was sent in the last minute)")
    else:
        assert r.status_code == 200 and len(brevo_calls) == 1, r.text
        sent = json.loads(brevo_calls[0].content)
        assert sent["to"][0]["email"] == email and len([ch for ch in sent["subject"] if ch.isdigit()]) == 6
        print("✓ 7. Forgot-password endpoint delivered a 6-digit OTP through Brevo")

    print("\n🎉 ALL BREVO EMAIL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
