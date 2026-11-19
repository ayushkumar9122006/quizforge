"""
"Sign in with Google" tests. Google's signing keys are replaced by a locally
generated RSA key, so no network or real Google account is needed.

Run:  python test_google_login.py
"""
import asyncio
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import httpx  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from jose import jwk, jwt  # noqa: E402

from database.config import settings  # noqa: E402
import utils.google_auth as ga  # noqa: E402

CLIENT_ID = "1234567890-test.apps.googleusercontent.com"
_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIV = _key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
PUB = _key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
JWKS = {"keys": [{**jwk.construct(PUB, "RS256").to_dict(), "kid": "test-kid", "use": "sig", "alg": "RS256"}]}
_other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_PRIV = _other.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()


async def _fake_keys(force=False):
    return JWKS


def token(email, *, aud=CLIENT_ID, iss="https://accounts.google.com", verified=True, exp_in=600, name="Google Student", key=PRIV):
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": uuid.uuid4().hex, "email": email, "email_verified": verified,
              "name": name, "picture": "https://lh3.googleusercontent.com/a/x", "iat": now, "exp": now + exp_in}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-kid"})


async def main():
    from main import app
    settings.google_client_id = CLIENT_ID
    ga._google_keys = _fake_keys
    new_email = f"g{uuid.uuid4().hex[:8]}@gmail.com"
    admin_email = os.getenv("GOOGLE_TEST_ADMIN", "admin@quizforge.com")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/auth/google/config")
        assert r.status_code == 200 and r.json() == {"enabled": True, "client_id": CLIENT_ID}, r.text
        print("✓ 1. /auth/google/config tells the login screen to show the button")

        r = await c.post("/auth/google", json={"credential": token(new_email, name="Riya Sharma"), "role": "student"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == new_email and u["name"] == "Riya Sharma" and u["role"] == "student"
        first_id = u["id"]
        me = await c.get("/sessions/attempts/my", headers={"Authorization": "Bearer " + r.json()["access_token"]})
        assert me.status_code == 200
        print("✓ 2. New Google email → student account created, tokens work on the API")

        r = await c.post("/auth/google", json={"credential": token(new_email.upper()), "role": "student"})
        assert r.status_code == 200 and r.json()["user"]["id"] == first_id
        print("✓ 3. Same email again → logs into the same account (no duplicate)")

        r = await c.post("/auth/google", json={"credential": token(admin_email), "role": "admin"})
        assert r.status_code == 200 and r.json()["user"]["role"] == "admin", r.text
        print("✓ 4. Existing admin email on the Admin screen → admin login")

        r = await c.post("/auth/google", json={"credential": token(admin_email), "role": "student"})
        assert r.status_code == 403 and "Admin login" in r.json()["detail"]
        r = await c.post("/auth/google", json={"credential": token(f"x{uuid.uuid4().hex[:6]}@gmail.com"), "role": "admin"})
        assert r.status_code == 403
        r = await c.post("/auth/google", json={"credential": token(new_email), "role": "admin"})
        assert r.status_code == 403
        print("✓ 5. Google can't create admins; screens can't be mixed up")

        bad = {
            "wrong audience": token(new_email, aud="someone-else.apps.googleusercontent.com"),
            "wrong issuer": token(new_email, iss="https://evil.example.com"),
            "expired": token(new_email, exp_in=-120),
            "unverified email": token(new_email, verified=False),
            "forged signature": token(new_email, key=OTHER_PRIV),
            "garbage": "x" * 40,
        }
        for label, cred in bad.items():
            r = await c.post("/auth/google", json={"credential": cred, "role": "student"})
            assert r.status_code == 401, (label, r.status_code, r.text)
        print("✓ 6. Rejected: wrong audience, wrong issuer, expired, unverified email, forged signature, garbage")

        settings.google_client_id = ""
        r = await c.get("/auth/google/config")
        assert r.json()["enabled"] is False
        r = await c.post("/auth/google", json={"credential": token(new_email), "role": "student"})
        assert r.status_code == 401 and "not configured" in r.json()["detail"]
        print("✓ 7. Without GOOGLE_CLIENT_ID the button is hidden and the endpoint refuses")

        r = await c.post("/auth/login", json={"email": admin_email, "password": os.getenv("GOOGLE_TEST_ADMIN_PW", "Admin@123")})
        assert r.status_code == 200
        print("✓ 8. Normal email + password login still works")

    print("\n🎉 ALL GOOGLE SIGN-IN TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
