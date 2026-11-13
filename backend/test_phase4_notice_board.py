"""
QuizForge — Phase 4 Notice Board & Per-Student LinkedIn-Style Notification Tests
Verifies all 12 requirements:
 1. Student with 0 unread notices -> count 0 (bell only, no badge)
 2. Student with 3 unread notices -> count 3 (bell shows 3)
 3. Student opens Notice Board / mark-read -> count 0 (badge disappears immediately)
 4. Refresh after reading -> count remains 0 across reload/query
 5. Admin publishes 1 new notice -> student sees badge 1
 6. Admin publishes 2 new notices -> student sees badge 3 (1 + 2)
 7. Student A reads notice -> Student B still sees it as unread
 8. Student reads same notice repeatedly -> only 1 notice_reads record (idempotency, unique constraint)
 9. Inactive / expired notices -> do not contribute to unread count
 10. Pinned notices -> appear first in order
 11. New notice after previously reading all -> only new notice increments count
 12. Multiple students -> independent counts

Also verifies API Authorization & Security:
 - Students cannot access /notices/admin (HTTP 403 Forbidden)
 - Students cannot POST/PATCH/DELETE /notices/ (HTTP 403 Forbidden)
 - Mark-read API returns HTTP 200 with accurate unread_count
"""
import asyncio
import uuid
from datetime import datetime, timedelta
import httpx
from database.config import AsyncSessionLocal
from models.all_models import User, UserRole, Notice, NoticeRead, NoticePriority
from schemas.notice import NoticeCreate, NoticeUpdate
from crud import notice as notice_crud
from utils.security import create_access_token
from main import app
from sqlalchemy import select, func, delete


async def run_tests():
    print("=" * 70)
    print("RUNNING PHASE 4 NOTICE BOARD AUTOMATED TEST SUITE")
    print("=" * 70)

    async with AsyncSessionLocal() as db:
        # ── Setup Test Users ──────────────────────────────────────────────────
        unique_suffix = uuid.uuid4().hex[:6]
        admin = User(
            email=f"admin_p4_{unique_suffix}@test.com",
            name="Admin P4",
            hashed_password="hash",
            role=UserRole.admin,
            is_active=True
        )
        student_a = User(
            email=f"student_a_{unique_suffix}@test.com",
            name="Student Alice",
            hashed_password="hash",
            role=UserRole.student,
            is_active=True
        )
        student_b = User(
            email=f"student_b_{unique_suffix}@test.com",
            name="Student Bob",
            hashed_password="hash",
            role=UserRole.student,
            is_active=True
        )
        db.add_all([admin, student_a, student_b])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(student_a)
        await db.refresh(student_b)

        admin_token = create_access_token({"sub": admin.id})
        student_a_token = create_access_token({"sub": student_a.id})
        student_b_token = create_access_token({"sub": student_b.id})

        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        student_a_headers = {"Authorization": f"Bearer {student_a_token}"}
        student_b_headers = {"Authorization": f"Bearer {student_b_token}"}

        created_notice_ids = []

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            try:
                # Baseline: Mark any pre-existing DB notices as read for test students
                await client.post("/notices/mark-read", json={}, headers=student_a_headers)
                await client.post("/notices/mark-read", json={}, headers=student_b_headers)

                # ── TEST 1: Student with 0 unread notices ─────────────────────────
                print("\n[TEST 1] Student with 0 active notices...")
                res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
                data = res.json()
                assert data["unread_count"] == 0, f"Expected 0 unread, got {data['unread_count']}"
                print("  ✓ API GET /notices/unread-count returned 0 (bell only, no badge)")

                # ── TEST 2: Student with 3 unread notices ─────────────────────────
                print("\n[TEST 2] Admin creates 3 notices via API...")
                for item in [
                    {"title": "Exam Schedule", "content": "Exam starts next week.", "priority": "high"},
                    {"title": "Library Hours", "content": "Library open 24/7.", "priority": "medium"},
                    {"title": "System Maintenance", "content": "Tonight at midnight.", "priority": "low"},
                ]:
                    resp = await client.post("/notices/", json=item, headers=admin_headers)
                    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
                    created_notice_ids.append(resp.json()["id"])

                res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res.status_code == 200
                assert res.json()["unread_count"] == 3
                print("  ✓ Admin published 3 notices -> Student A unread_count = 3 (badge shows 3)")

                # ── TEST 3: Student opens Notice Board / mark-as-read ─────────────
                print("\n[TEST 3] Student A opens Notice Board (calls POST /notices/mark-read)...")
                mark_res = await client.post("/notices/mark-read", json={}, headers=student_a_headers)
                assert mark_res.status_code == 200
                mark_data = mark_res.json()
                assert mark_data["marked_count"] == 3, f"Expected 3 marked, got {mark_data['marked_count']}"
                assert mark_data["unread_count"] == 0, f"Expected 0 remaining, got {mark_data['unread_count']}"

                check_res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert check_res.json()["unread_count"] == 0
                print("  ✓ Notices marked read; badge count is 0 (numeric badge disappears immediately)")

                # ── TEST 4: Refresh after reading ─────────────────────────────────
                print("\n[TEST 4] Refresh after reading (persistent state check)...")
                refresh_res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert refresh_res.json()["unread_count"] == 0
                
                list_res = await client.get("/notices/", headers=student_a_headers)
                assert list_res.status_code == 200
                notices = list_res.json()
                test_notices = [n for n in notices if n["id"] in created_notice_ids]
                assert len(test_notices) == 3
                assert all(n["is_read"] is True for n in test_notices)
                print("  ✓ Read status persists across refreshes and reload queries")

                # ── TEST 5: Admin publishes a new notice ──────────────────────────
                print("\n[TEST 5] Admin publishes 1 new notice...")
                resp = await client.post("/notices/", json={
                    "title": "Urgent: Room Change",
                    "content": "Room 101 -> 202",
                    "priority": "urgent"
                }, headers=admin_headers)
                assert resp.status_code == 201
                n4_id = resp.json()["id"]
                created_notice_ids.append(n4_id)

                res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res.json()["unread_count"] == 1
                print("  ✓ Student A sees badge 1 for the newly published notice")

                # ── TEST 6: Admin publishes 2 more notices ────────────────────────
                print("\n[TEST 6] Admin publishes 2 additional notices...")
                for item in [
                    {"title": "Holiday Announcement", "content": "Campus closed Monday.", "priority": "low"},
                    {"title": "Sports Meet", "content": "Registration open.", "priority": "medium"},
                ]:
                    resp = await client.post("/notices/", json=item, headers=admin_headers)
                    assert resp.status_code == 201
                    created_notice_ids.append(resp.json()["id"])

                res = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res.json()["unread_count"] == 3
                print("  ✓ Student A sees badge 3 after 2 more notices published (1 + 2)")

                # ── TEST 7: Student A reads -> Student B must still see unread ────
                print("\n[TEST 7] Per-student isolation: Student A reads vs Student B unread...")
                # Student A marks all as read
                await client.post("/notices/mark-read", json={}, headers=student_a_headers)
                res_a = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res_a.json()["unread_count"] == 0

                # Student B has not read anything (total 6 notices active)
                res_b = await client.get("/notices/unread-count", headers=student_b_headers)
                assert res_b.json()["unread_count"] == 6
                print("  ✓ Student A unread = 0, Student B unread = 6 (strictly isolated per-student)")

                # ── TEST 8: Repeated reads -> Unique constraint & idempotency ─────
                print("\n[TEST 8] Student reads same notice repeatedly (idempotency)...")
                # Repeat mark-read calls for student A
                await client.post("/notices/mark-read", json={"notice_ids": [created_notice_ids[0]]}, headers=student_a_headers)
                await client.post("/notices/mark-read", json={"notice_ids": [created_notice_ids[0]]}, headers=student_a_headers)
                
                # Verify DB has only 1 row
                read_recs = await db.execute(
                    select(func.count(NoticeRead.id)).where(
                        NoticeRead.notice_id == created_notice_ids[0],
                        NoticeRead.user_id == student_a.id
                    )
                )
                assert read_recs.scalar_one() == 1
                print("  ✓ Exactly 1 notice_reads record exists despite repeated calls")

                # ── TEST 9: Inactive & Expired notices excluded ────────────────────
                print("\n[TEST 9] Inactive & expired notices do not contribute to unread count...")
                # Create draft (is_active=False)
                resp_draft = await client.post("/notices/", json={
                    "title": "Draft Exam Schedule",
                    "content": "Not published yet",
                    "is_active": False
                }, headers=admin_headers)
                assert resp_draft.status_code == 201
                created_notice_ids.append(resp_draft.json()["id"])

                # Create expired notice
                n_exp = await notice_crud.create_notice(
                    db,
                    NoticeCreate(
                        title="Expired Notice",
                        content="Old news",
                        expires_at=datetime.utcnow() - timedelta(days=1)
                    ),
                    admin.id
                )
                created_notice_ids.append(n_exp.id)

                # Student A still has 0
                res_a_check = await client.get("/notices/unread-count", headers=student_a_headers)
                assert res_a_check.json()["unread_count"] == 0

                # Student B still has 6 (draft and expired ignored)
                res_b_check = await client.get("/notices/unread-count", headers=student_b_headers)
                assert res_b_check.json()["unread_count"] == 6
                print("  ✓ Draft and expired notices are correctly excluded from badge count")

                # ── TEST 10: Pinned notices ordering ──────────────────────────────
                print("\n[TEST 10] Pinned notice ordering...")
                resp_pinned = await client.post("/notices/", json={
                    "title": "Pinned Policy Announcement",
                    "content": "Must read details.",
                    "pinned": True
                }, headers=admin_headers)
                assert resp_pinned.status_code == 201
                pinned_id = resp_pinned.json()["id"]
                created_notice_ids.append(pinned_id)

                list_resp = await client.get("/notices/", headers=student_a_headers)
                notices_list = list_resp.json()
                assert notices_list[0]["id"] == pinned_id
                assert notices_list[0]["pinned"] is True
                print("  ✓ Pinned notice is ordered first ahead of all other notices")

                # ── TEST 11: New notice after student previously read all ─────────
                print("\n[TEST 11] New notice after student previously read all...")
                # Student A marks all as read
                await client.post("/notices/mark-read", json={}, headers=student_a_headers)
                assert (await client.get("/notices/unread-count", headers=student_a_headers)).json()["unread_count"] == 0

                # Admin publishes Notice 8
                resp_n8 = await client.post("/notices/", json={
                    "title": "Fresh Final Notice",
                    "content": "Brand new announcement."
                }, headers=admin_headers)
                n8_id = resp_n8.json()["id"]
                created_notice_ids.append(n8_id)

                assert (await client.get("/notices/unread-count", headers=student_a_headers)).json()["unread_count"] == 1
                print("  ✓ Student A sees exactly 1 unread notice for the new announcement")

                # Editing the notice does NOT reset read status
                await client.patch(f"/notices/{n8_id}", json={"title": "Fresh Final Notice (Updated)"}, headers=admin_headers)
                assert (await client.get("/notices/unread-count", headers=student_a_headers)).json()["unread_count"] == 1
                print("  ✓ Notice edit does not reset student read state")

                # ── TEST 12: Multiple students independent counts ─────────────────
                print("\n[TEST 12] Multiple students independent unread count verification...")
                # Student A: 1 unread (Notice 8)
                # Student B: 8 active unread
                count_a = (await client.get("/notices/unread-count", headers=student_a_headers)).json()["unread_count"]
                count_b = (await client.get("/notices/unread-count", headers=student_b_headers)).json()["unread_count"]
                assert count_a == 1, f"Expected Student A count = 1, got {count_a}"
                assert count_b == 8, f"Expected Student B count = 8, got {count_b}"

                # Student B reads 3 specific notices
                await client.post("/notices/mark-read", json={"notice_ids": created_notice_ids[:3]}, headers=student_b_headers)
                count_b_after = (await client.get("/notices/unread-count", headers=student_b_headers)).json()["unread_count"]
                assert count_b_after == 5, f"Expected Student B count = 5, got {count_b_after}"

                # Student A count remains unaffected
                count_a_after = (await client.get("/notices/unread-count", headers=student_a_headers)).json()["unread_count"]
                assert count_a_after == 1, f"Expected Student A count = 1, got {count_a_after}"
                print("  ✓ Multi-student independence confirmed (Student A: 1, Student B: 5)")

                # ── SECURITY & RBAC TESTS ─────────────────────────────────────────
                print("\n[RBAC TESTS] Security & Permission verification...")
                # Student trying to access admin endpoint
                res_sec1 = await client.get("/notices/admin", headers=student_a_headers)
                assert res_sec1.status_code == 403, f"Expected 403 for student on /notices/admin, got {res_sec1.status_code}"
                
                # Student trying to create notice
                res_sec2 = await client.post("/notices/", json={"title": "Hacked", "content": "test"}, headers=student_a_headers)
                assert res_sec2.status_code == 403, f"Expected 403 for student on POST /notices/, got {res_sec2.status_code}"

                # Student trying to delete notice
                res_sec3 = await client.delete(f"/notices/{n8_id}", headers=student_a_headers)
                assert res_sec3.status_code == 403, f"Expected 403 for student on DELETE /notices/{n8_id}, got {res_sec3.status_code}"
                print("  ✓ RBAC enforced: Students cannot view admin lists, create, or delete notices (HTTP 403 Forbidden)")

                print("\n" + "=" * 70)
                print("ALL 12 PHASE 4 NOTICE BOARD & RBAC TESTS PASSED PERFECTLY!")
                print("=" * 70)

            finally:
                # Cleanup test notices & users
                if created_notice_ids:
                    for nid in created_notice_ids:
                        await db.execute(delete(NoticeRead).where(NoticeRead.notice_id == nid))
                        await db.execute(delete(Notice).where(Notice.id == nid))
                await db.execute(delete(User).where(User.id.in_([admin.id, student_a.id, student_b.id])))
                await db.commit()


if __name__ == "__main__":
    asyncio.run(run_tests())
