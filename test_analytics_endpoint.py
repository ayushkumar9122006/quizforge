import asyncio
import httpx
import json

BASE_URL = "http://127.0.0.1:8000"

async def test_analytics():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # Admin login
        res = await client.post("/auth/login", json={"email": "admin@quizforge.com", "password": "Admin@123"})
        admin_token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Student login
        res = await client.post("/auth/login", json={"email": "student@quizforge.com", "password": "Student@123"})
        student_token = res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {student_token}"}

        # Get published quizzes
        res = await client.get("/quizzes/published", headers=headers)
        quizzes = res.json()
        assert len(quizzes) > 0
        quiz_id = quizzes[0]["id"]

        # Create session
        res = await client.post("/sessions/", json={"quiz_id": quiz_id, "max_students": 50}, headers=headers)
        session = res.json()
        session_id = session["id"]
        room_code = session["room_code"]
        print(f"Created session {session_id} with room code {room_code}")

        # Student joins
        res = await client.post("/sessions/join", json={"room_code": room_code}, headers=s_headers)
        assert res.status_code == 200

        # Admin starts
        res = await client.post(f"/sessions/{session_id}/start", headers=headers)
        assert res.status_code == 200

        # Student submits with per-question timing
        res = await client.get(f"/quizzes/{quiz_id}", headers=s_headers)
        quiz_detail = res.json()
        questions = quiz_detail["questions"]

        answers_payload = []
        for i, q in enumerate(questions):
            answers_payload.append({
                "question_id": q["id"],
                "selected_option": 0,
                "time_taken_sec": 10 + i * 5
            })

        submit_payload = {
            "answers": answers_payload,
            "time_taken_sec": 65
        }
        res = await client.post(f"/sessions/{session_id}/submit", json=submit_payload, headers=s_headers)
        assert res.status_code == 200
        print("Student submission response received:", res.json()["score"])

        # Fetch session analytics
        res = await client.get(f"/sessions/{session_id}/analytics", headers=headers)
        assert res.status_code == 200
        data = res.json()
        print("\nSession Analytics Keys:", list(data.keys()))
        print("Total submitted:", data["total_submitted"])
        print("Students list count:", len(data.get("students", [])))
        if data.get("students"):
            st = data["students"][0]
            print(f"Student: {st['student_name']}, Score: {st['score']}/{st['total_marks']}, Time: {st['time_taken_sec']}s")
            print("Student section breakdown:", st.get("section_breakdown"))
        print("Section stats:", data.get("section_stats"))
        print("\n--- Analytics Verified Successfully! ---")

if __name__ == "__main__":
    asyncio.run(test_analytics())
