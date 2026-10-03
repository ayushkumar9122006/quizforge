"""
QuiZee — Automated Test Suite for Resend API Email Delivery & Password Recovery
Covers:
- Successful email delivery (mocked Resend API)
- Invalid API key (mocked 401)
- Resend API failure (mocked 422 / 500)
- Network timeout
- Student forgot-password request
- Admin forgot-password request
- OTP verification
- Expired OTP handling
- Password reset and login with new password
- Rate limiting (60s cooldown)
- Account enumeration protection
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, AsyncMock
import httpx
from httpx import AsyncClient, ASGITransport

from main import app
from database.config import settings, AsyncSessionLocal
from services.email_service import send_otp_email, _mask_email, _send_resend_async
from models.all_models import User, UserRole, PasswordResetOTP
from utils.security import hash_password
from sqlalchemy import select


async def run_resend_test_suite():
    print("=" * 70)
    print("QuiZee: Starting Resend API & Password Recovery Test Suite")
    print("=" * 70)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Masking verification
    # ─────────────────────────────────────────────────────────────────────────
    assert _mask_email("student@example.com") == "s***t@example.com"
    assert _mask_email("admin@quizee.com") == "a***n@quizee.com"
    print("✓ 1. Email masking verified for logging privacy.")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Resend API Unit Tests (Mocked at HTTP request level)
    # ─────────────────────────────────────────────────────────────────────────
    # A. Successful Resend response (200 / 201)
    mock_success_resp = httpx.Response(200, json={"id": "re_mock_123456789"})
    with patch("services.email_service.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch.object(settings, "environment", "production"), \
         patch.object(settings, "resend_api_key", "re_test_valid_key"), \
         patch.object(settings, "email_from", "onboarding@resend.dev"):
        mock_post.return_value = mock_success_resp
        success, err = await _send_resend_async("student@example.com", "Reset Code", "Code: 123456", "<p>123456</p>")
        assert success is True, "Resend 200 must return True"
        assert mock_post.called
        called_args = mock_post.call_args
        assert called_args[0][0] == "https://api.resend.com/emails"
        assert called_args[1]["json"]["from"] == "onboarding@resend.dev"
        assert called_args[1]["json"]["to"] == ["student@example.com"]
        assert "123456" in called_args[1]["json"]["text"]
    print("✓ 2A. Resend successful delivery (mocked 200) verified.")

    # B. Invalid API Key (401 Unauthorized)
    mock_401_resp = httpx.Response(401, json={"statusCode": 401, "message": "API key is invalid", "name": "validation_error"})
    with patch("services.email_service.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch.object(settings, "environment", "production"), \
         patch.object(settings, "resend_api_key", "re_invalid_key"):
        mock_post.return_value = mock_401_resp
        success, err = await _send_resend_async("student@example.com", "Reset Code", "Code: 123456", "<p>123456</p>")
        assert success is False, "Resend 401 must return False"
        assert "invalid" in err.lower()
    print("✓ 2B. Resend invalid API key (mocked 401) safely handled.")

    # C. Resend API Failure (422 Unprocessable / Rejected sender)
    mock_422_resp = httpx.Response(422, json={"statusCode": 422, "message": "from address is not verified", "name": "validation_error"})
    with patch("services.email_service.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch.object(settings, "environment", "production"), \
         patch.object(settings, "resend_api_key", "re_test_key"):
        mock_post.return_value = mock_422_resp
        success, err = await _send_resend_async("student@example.com", "Reset Code", "Code: 123456", "<p>123456</p>")
        assert success is False, "Resend 422 must return False"
        assert "422" in err
    print("✓ 2C. Resend unprocessable / sender error (mocked 422) safely handled.")

    # D. Network Timeout
    with patch("services.email_service.httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Connection timed out")), \
         patch.object(settings, "environment", "production"), \
         patch.object(settings, "resend_api_key", "re_test_key"):
        success, err = await _send_resend_async("student@example.com", "Reset Code", "Code: 123456", "<p>123456</p>")
        assert success is False, "Network timeout must return False"
        assert "timed out" in err.lower()
    print("✓ 2D. Network timeout handled gracefully without crashing.")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Full HTTP Router Flows with TestClient
    # ─────────────────────────────────────────────────────────────────────────
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Account Enumeration Protection: Non-existent email returns 200 generic message
        resp = await client.post("/auth/forgot-password/send-otp", json={
            "email": f"ghost_{uuid.uuid4().hex[:8]}@example.com",
            "role": "student"
        })
        assert resp.status_code == 200
        assert "verification code has been sent" in resp.json()["message"]
        print("✓ 3A. Account enumeration protection verified (non-existent email returns generic 200).")

        # B. Student Forgot-Password, OTP Verification, and Password Reset Flow
        student_email = f"student_{uuid.uuid4().hex[:8]}@example.com"
        await client.post("/auth/register", json={
            "email": student_email,
            "name": "Student Resend User",
            "password": "originalPassword123",
            "role": "student"
        })

        # Send OTP for Student with mocked Resend delivery
        with patch("services.email_service._send_resend_async", new_callable=AsyncMock) as mock_resend, \
             patch.object(settings, "environment", "production"), \
             patch.object(settings, "resend_api_key", "re_test_key"):
            mock_resend.return_value = (True, "")
            resp = await client.post("/auth/forgot-password/send-otp", json={
                "email": student_email,
                "role": "student"
            })
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

            # Verify rate limit (60s cooldown)
            rl_resp = await client.post("/auth/forgot-password/send-otp", json={
                "email": student_email,
                "role": "student"
            })
            assert rl_resp.status_code == 429, f"Expected 429 rate limit, got {rl_resp.status_code}"
        print("✓ 3B. Student forgot-password request & 60s rate limiting verified.")

        # Extract generated OTP record id from DB
        latest_otp_id = None
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email == student_email))
            student_user = result.scalar_one()
            otp_res = await db.execute(
                select(PasswordResetOTP).where(
                    PasswordResetOTP.user_id == student_user.id,
                    PasswordResetOTP.role == "student"
                ).order_by(PasswordResetOTP.created_at.desc())
            )
            rec = otp_res.scalars().first()
            assert rec is not None
            latest_otp_id = rec.id

        # Verify wrong OTP rejected (400)
        bad_verify = await client.post("/auth/forgot-password/verify-otp", json={
            "email": student_email,
            "otp": "000000",
            "role": "student"
        })
        assert bad_verify.status_code == 400

        # Set known OTP in database session for verification test
        raw_otp = "789123"
        async with AsyncSessionLocal() as db:
            rec = await db.get(PasswordResetOTP, latest_otp_id)
            rec.hashed_otp = hash_password(raw_otp)
            rec.attempts = 0
            await db.commit()

        # Verify valid OTP
        verify_resp = await client.post("/auth/forgot-password/verify-otp", json={
            "email": student_email,
            "otp": raw_otp,
            "role": "student"
        })
        assert verify_resp.status_code == 200, f"Expected 200, got {verify_resp.status_code}: {verify_resp.text}"
        reset_token = verify_resp.json()["reset_token"]
        assert len(reset_token) > 20

        # Reset password
        reset_resp = await client.post("/auth/forgot-password/reset-password", json={
            "email": student_email,
            "reset_token": reset_token,
            "new_password": "newStudentPassword456",
            "role": "student"
        })
        assert reset_resp.status_code == 200

        # Login with new password
        login_resp = await client.post("/auth/login", json={
            "email": student_email,
            "password": "newStudentPassword456"
        })
        assert login_resp.status_code == 200
        assert "access_token" in login_resp.json()
        print("✓ 3C. Student OTP verification, password reset, and login verified.")

        # C. Admin Forgot-Password, OTP Verification, and Password Reset Flow
        admin_email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
        async with AsyncSessionLocal() as db:
            admin_user = User(
                email=admin_email,
                name="Admin Resend User",
                hashed_password=hash_password("adminOriginalPass123"),
                role=UserRole.admin
            )
            db.add(admin_user)
            await db.commit()

        with patch("services.email_service._send_resend_async", new_callable=AsyncMock) as mock_resend, \
             patch.object(settings, "environment", "production"), \
             patch.object(settings, "resend_api_key", "re_test_key"):
            mock_resend.return_value = (True, "")
            admin_send = await client.post("/auth/forgot-password/send-otp", json={
                "email": admin_email,
                "role": "admin"
            })
            assert admin_send.status_code == 200

        # Set known OTP on admin record in database
        raw_admin_otp = "654321"
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(User).where(User.email == admin_email))
            adm = res.scalar_one()
            adm_otp_res = await db.execute(
                select(PasswordResetOTP).where(
                    PasswordResetOTP.user_id == adm.id,
                    PasswordResetOTP.role == "admin"
                ).order_by(PasswordResetOTP.created_at.desc())
            )
            adm_rec = adm_otp_res.scalars().first()
            adm_rec.hashed_otp = hash_password(raw_admin_otp)
            adm_rec.attempts = 0
            await db.commit()

        # Verify admin OTP
        adm_verify = await client.post("/auth/forgot-password/verify-otp", json={
            "email": admin_email,
            "otp": raw_admin_otp,
            "role": "admin"
        })
        assert adm_verify.status_code == 200
        adm_reset_token = adm_verify.json()["reset_token"]

        # Reset admin password
        adm_reset = await client.post("/auth/forgot-password/reset-password", json={
            "email": admin_email,
            "reset_token": adm_reset_token,
            "new_password": "newAdminPassword789",
            "role": "admin"
        })
        assert adm_reset.status_code == 200

        # Login with new admin password
        adm_login = await client.post("/auth/login", json={
            "email": admin_email,
            "password": "newAdminPassword789"
        })
        assert adm_login.status_code == 200
        assert adm_login.json()["user"]["role"] == "admin"
        print("✓ 3D. Administrator forgot-password, OTP verification, and login verified.")

        # D. Expired OTP Test
        expired_email = f"expired_{uuid.uuid4().hex[:8]}@example.com"
        await client.post("/auth/register", json={
            "email": expired_email,
            "name": "Expired Tester",
            "password": "password123",
            "role": "student"
        })
        with patch("services.email_service._send_resend_async", new_callable=AsyncMock) as mock_resend, \
             patch.object(settings, "environment", "production"), \
             patch.object(settings, "resend_api_key", "re_test_key"):
            mock_resend.return_value = (True, "")
            await client.post("/auth/forgot-password/send-otp", json={
                "email": expired_email,
                "role": "student"
            })

        # Artificially expire the OTP in database
        async with AsyncSessionLocal() as db:
            u_res = await db.execute(select(User).where(User.email == expired_email))
            u = u_res.scalar_one()
            o_res = await db.execute(
                select(PasswordResetOTP).where(PasswordResetOTP.user_id == u.id)
                .order_by(PasswordResetOTP.created_at.desc())
            )
            o = o_res.scalars().first()
            o.hashed_otp = hash_password("111222")
            o.expires_at = datetime.utcnow() - timedelta(minutes=10)
            await db.commit()

        exp_verify = await client.post("/auth/forgot-password/verify-otp", json={
            "email": expired_email,
            "otp": "111222",
            "role": "student"
        })
        assert exp_verify.status_code == 400
        assert "expired" in exp_verify.json()["detail"].lower()
        print("✓ 3E. Expired OTP handling verified (returns 400 with expiration notice).")

        # E. Resend Failure in Production returns 503
        failing_email = f"fail_{uuid.uuid4().hex[:8]}@example.com"
        await client.post("/auth/register", json={
            "email": failing_email,
            "name": "Fail Tester",
            "password": "password123",
            "role": "student"
        })
        with patch("services.email_service._send_resend_async", new_callable=AsyncMock) as mock_resend, \
             patch.object(settings, "environment", "production"), \
             patch.object(settings, "resend_api_key", "re_test_key"):
            mock_resend.return_value = (False, "Resend API error (403): domain not verified")
            fail_resp = await client.post("/auth/forgot-password/send-otp", json={
                "email": failing_email,
                "role": "student"
            })
            assert fail_resp.status_code == 503, f"Expected 503, got {fail_resp.status_code}"
            assert "temporarily unavailable" in fail_resp.json()["detail"].lower()
            print("✓ 3F. Resend API failure in production correctly returns 503 Service Unavailable.")

    print("\n" + "=" * 70)
    print("🎉 ALL RESEND API & PASSWORD RECOVERY TESTS PASSED FLAWLESSLY!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_resend_test_suite())
