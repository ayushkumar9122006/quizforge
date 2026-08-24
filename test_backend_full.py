import asyncio
import httpx
import websockets
import json

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000"

async def test_auth():
    print("\n--- 1. Testing Auth API ---")
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # 1. Admin login
        res = await client.post("/auth/login", json={"email": "admin@quizforge.com", "password": "Admin@123"})
        print(f"Admin Login: {res.status_code}")
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        admin_tokens = res.json()
        admin_token = admin_tokens["access_token"]
        print(f"Admin Token obtained: {admin_token[:15]}...")

        # 2. Student login
        res = await client.post("/auth/login", json={"email": "student@quizforge.com", "password": "Student@123"})
        print(f"Student Login: {res.status_code}")
        assert res.status_code == 200, f"Student login failed: {res.text}"
        student_tokens = res.json()
        student_token = student_tokens["access_token"]
        print(f"Student Token obtained: {student_token[:15]}...")

        # 3. Auth Me
        res = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        print(f"Admin /auth/me: {res.status_code}, User: {res.json().get('email')}, Role: {res.json().get('role')}")
        assert res.status_code == 200

        # 4. Token Refresh
        res = await client.post("/auth/refresh", json={"refresh_token": admin_tokens["refresh_token"]})
        print(f"Admin /auth/refresh: {res.status_code}")
        assert res.status_code == 200

        return admin_token, student_token

async def test_quizzes(admin_token):
    print("\n--- 2. Testing Quizzes API ---")
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as client:
        # Get quizzes
        res = await client.get("/quizzes")
        print(f"Get Quizzes: {res.status_code}")
        quizzes = res.json()
        print(f"Found {len(quizzes)} quizzes.")
        for q in quizzes:
            print(f" - Quiz ID {q['id']}: '{q['title']}' (Published: {q['is_published']})")

        # Create new quiz
        new_quiz_payload = {
            "title": "Automated Test Quiz",
            "description": "Created during feature testing",
            "duration_minutes": 10,
            "shuffle_questions": True,
            "show_results_immediately": True,
            "pass_percentage": 50,
            "is_published": True,
            "sections": [
                {
                    "name": "General Knowledge",
                    "order": 0,
                    "questions": [
                        {
                            "question_text": "What is the capital of France?",
                            "question_type": "single_choice",
                            "order": 0,
                            "points": 1.0,
                            "options": [
                                {"option_text": "Paris", "is_correct": True, "order": 0},
                                {"option_text": "London", "is_correct": False, "order": 1},
                                {"option_text": "Berlin", "is_correct": False, "order": 2},
                                {"option_text": "Madrid", "is_correct": False, "order": 3}
                            ]
                        }
                    ]
                }
            ]
        }
        res = await client.post("/quizzes", json=new_quiz_payload)
        print(f"Create Quiz: {res.status_code}")
        assert res.status_code in (200, 201), f"Create quiz failed: {res.text}"
        created_quiz = res.json()
        quiz_id = created_quiz["id"]
        print(f"Created quiz ID: {quiz_id}")

        # Get specific quiz details
        res = await client.get(f"/quizzes/{quiz_id}")
        print(f"Get Quiz {quiz_id}: {res.status_code}")
        assert res.status_code == 200

        return quiz_id

async def test_session_and_ws(admin_token, student_token, quiz_id):
    print("\n--- 3. Testing Sessions & WebSockets ---")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    student_headers = {"Authorization": f"Bearer {student_token}"}

    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # Create session
        res = await client.post(f"/sessions", json={"quiz_id": quiz_id}, headers=admin_headers)
        print(f"Create Session: {res.status_code}")
        assert res.status_code in (200, 201), f"Create session failed: {res.text}"
        session_data = res.json()
        session_id = session_data["id"]
        room_code = session_data["room_code"]
        print(f"Session created: ID={session_id}, Room Code={room_code}, Status={session_data['status']}")

        # Student joins session via code
        res = await client.get(f"/sessions/join/{room_code}", headers=student_headers)
        print(f"Student Join info: {res.status_code}")
        assert res.status_code == 200
        join_info = res.json()
        print(f"Join info quiz title: {join_info['title']}")

        # Test WebSocket connection for admin and student
        print("\nConnecting to WebSocket room...")
        ws_url = f"{WS_URL}/ws/{room_code}"

        async with websockets.connect(ws_url) as ws_admin, websockets.connect(ws_url) as ws_student:
            # Authenticate admin
            await ws_admin.send(json.dumps({"type": "auth", "token": admin_token}))
            auth_resp = json.loads(await ws_admin.recv())
            print(f"Admin WS Auth response: {auth_resp.get('type')}")

            # Authenticate student
            await ws_student.send(json.dumps({"type": "auth", "token": student_token}))
            auth_resp2 = json.loads(await ws_student.recv())
            print(f"Student WS Auth response: {auth_resp2.get('type')}")

            # Admin starts quiz session
            print("Admin starting session...")
            res = await client.patch(f"/sessions/{session_id}/status", json={"status": "live"}, headers=admin_headers)
            print(f"Admin start session HTTP response: {res.status_code}")
            assert res.status_code == 200

            # Student starts attempt
            res = await client.post(f"/sessions/{session_id}/start-attempt", headers=student_headers)
            print(f"Student start attempt: {res.status_code}")
            assert res.status_code in (200, 201)
            attempt_data = res.json()
            attempt_id = attempt_data["id"]
            print(f"Attempt started: ID={attempt_id}")

            # Submit answer
            # Find question & option
            q_id = join_info["sections"][0]["questions"][0]["id"]
            correct_opt_id = [opt["id"] for opt in join_info["sections"][0]["questions"][0]["options"] if opt.get("option_text") == "Paris"][0]

            res = await client.post(
                f"/sessions/{session_id}/attempts/{attempt_id}/submit",
                json={
                    "answers": [
                        {
                            "question_id": q_id,
                            "selected_option_ids": [correct_opt_id],
                            "text_answer": None
                        }
                    ]
                },
                headers=student_headers
            )
            print(f"Submit attempt: {res.status_code}")
            assert res.status_code == 200
            result_data = res.json()
            print(f"Result: Score={result_data.get('score')}/{result_data.get('max_score')}, Passed={result_data.get('passed')}")

            # Check leaderboard
            res = await client.get(f"/sessions/{session_id}/leaderboard", headers=student_headers)
            print(f"Leaderboard: {res.status_code}")
            assert res.status_code == 200
            print(f"Leaderboard entries: {len(res.json().get('entries', []))}")

            # Check session analytics
            res = await client.get(f"/sessions/{session_id}/analytics", headers=admin_headers)
            print(f"Session Analytics: {res.status_code}")
            assert res.status_code == 200
            print("Analytics data received successfully.")

async def test_llm(admin_token):
    print("\n--- 4. Testing LLM Service ---")
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as client:
        payload = {
            "question_text": "What is the primary function of DNS in networking?",
            "options": ["Translates domain names to IP addresses", "Secures HTTP traffic", "Routes physical packets", "Allocates MAC addresses"],
            "correct_option": "Translates domain names to IP addresses"
        }
        res = await client.post("/llm/explain", json=payload)
        print(f"LLM Explain endpoint status: {res.status_code}")
        if res.status_code == 200:
            print(f"LLM Explanation: {res.json().get('explanation')[:100]}...")
        else:
            print(f"LLM Explain response: {res.text}")

async def main():
    admin_token, student_token = await test_auth()
    quiz_id = await test_quizzes(admin_token)
    await test_session_and_ws(admin_token, student_token, quiz_id)
    await test_llm(admin_token)
    print("\n==========================================")
    print("ALL BACKEND TEST SUITES COMPLETED!")
    print("==========================================")

if __name__ == "__main__":
    asyncio.run(main())
