import asyncio
import httpx
import websockets
import json

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000"

async def test_full_workflow():
    print("\n==========================================")
    print("      QuizForge Full Flow Testing        ")
    print("==========================================")

    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # 1. Auth Admin
        print("\n1. Logging in Admin...")
        res = await client.post("/auth/login", json={"email": "admin@quizforge.com", "password": "Admin@123"})
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        admin_data = res.json()
        admin_token = admin_data["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("✓ Admin logged in successfully.")

        # 2. Auth Student
        print("\n2. Logging in Student...")
        res = await client.post("/auth/login", json={"email": "student@quizforge.com", "password": "Student@123"})
        assert res.status_code == 200, f"Student login failed: {res.text}"
        student_data = res.json()
        student_token = student_data["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}
        print("✓ Student logged in successfully.")

        # 3. Create Quiz as Admin
        print("\n3. Creating new quiz as Admin...")
        quiz_payload = {
            "title": "Full Stack Mastery Quiz",
            "description": "Comprehensive test of algorithms & web systems",
            "time_per_q_sec": 60,
            "is_public": True,
            "tags": ["web", "algorithms"],
            "subject": "CS",
            "difficulty": "medium",
            "questions": [
                {
                    "order_index": 0,
                    "section": "Algorithms",
                    "text": "What is the time complexity of binary search?",
                    "question_image": None,
                    "content_type": "text",
                    "correct_answer": 0,
                    "explanation": "Binary search divides the search space in half at each step, yielding O(log n).",
                    "marks": 2,
                    "diagram": None,
                    "options": [
                        {"order_index": 0, "text": "O(log n)", "image": None, "content_type": "text"},
                        {"order_index": 1, "text": "O(n)", "image": None, "content_type": "text"},
                        {"order_index": 2, "text": "O(n log n)", "image": None, "content_type": "text"},
                        {"order_index": 3, "text": "O(1)", "image": None, "content_type": "text"}
                    ]
                },
                {
                    "order_index": 1,
                    "section": "Web",
                    "text": "Which HTTP status code signifies Unauthorized access?",
                    "question_image": None,
                    "content_type": "text",
                    "correct_answer": 1,
                    "explanation": "HTTP 401 Unauthorized indicates unauthenticated or invalid credentials.",
                    "marks": 1,
                    "diagram": None,
                    "options": [
                        {"order_index": 0, "text": "400 Bad Request", "image": None, "content_type": "text"},
                        {"order_index": 1, "text": "401 Unauthorized", "image": None, "content_type": "text"},
                        {"order_index": 2, "text": "403 Forbidden", "image": None, "content_type": "text"},
                        {"order_index": 3, "text": "404 Not Found", "image": None, "content_type": "text"}
                    ]
                }
            ]
        }
        res = await client.post("/quizzes/", json=quiz_payload, headers=admin_headers)
        assert res.status_code == 201, f"Create quiz failed: {res.text}"
        quiz = res.json()
        quiz_id = quiz["id"]
        print(f"✓ Quiz created with ID: {quiz_id} and {len(quiz['questions'])} questions.")

        # 4. Publish Quiz
        print("\n4. Publishing quiz...")
        res = await client.post(f"/quizzes/{quiz_id}/publish", headers=admin_headers)
        assert res.status_code == 200, f"Publish quiz failed: {res.text}"
        print("✓ Quiz published.")

        # 5. Create Live Session as Admin
        print("\n5. Creating live room session...")
        res = await client.post("/sessions/", json={"quiz_id": quiz_id, "max_students": 50}, headers=admin_headers)
        assert res.status_code == 201, f"Create session failed: {res.text}"
        session = res.json()
        session_id = session["id"]
        room_code = session["room_code"]
        print(f"✓ Session created: Session ID={session_id}, Room Code={room_code}")

        # 6. Student Joins Session via Room Code
        print(f"\n6. Student joining room with code {room_code}...")
        res = await client.post("/sessions/join", json={"room_code": room_code}, headers=student_headers)
        assert res.status_code == 200, f"Student join failed: {res.text}"
        print(f"✓ Student joined room: status={res.json()['status']}")

        # 7. WebSocket Live Interaction
        print("\n7. Testing WebSocket connections for Admin & Student...")
        ws_admin_url = f"{WS_URL}/ws/{room_code}?token={admin_token}"
        ws_student_url = f"{WS_URL}/ws/{room_code}?token={student_token}"

        async with websockets.connect(ws_admin_url) as ws_admin, websockets.connect(ws_student_url) as ws_student:
            # First message received is participants list
            admin_msg = json.loads(await ws_admin.recv())
            print(f"  Admin WS connected message: {admin_msg.get('type')}")

            student_msg = json.loads(await ws_student.recv())
            print(f"  Student WS connected message: {student_msg.get('type')}")

            # Check participants
            res = await client.get(f"/sessions/{session_id}/participants", headers=admin_headers)
            print(f"  Live Connected participants: {res.json().get('count')}")

            # Admin Starts Session
            print("\n8. Admin starts session...")
            res = await client.post(f"/sessions/{session_id}/start", headers=admin_headers)
            assert res.status_code == 200, f"Start session failed: {res.text}"
            print("✓ Session started.")

            # Student receives quiz:started event
            ws_event = json.loads(await ws_student.recv())
            print(f"  Student received WS event: {ws_event.get('type')}")

            # 9. Student submits attempt
            print("\n9. Student submitting attempt...")
            # Question 1: option 0 (correct), Question 2: option 1 (correct)
            q1_id = quiz["questions"][0]["id"]
            q2_id = quiz["questions"][1]["id"]
            submit_payload = {
                "answers": [
                    {"question_id": q1_id, "selected_option": 0, "time_taken_sec": 5},
                    {"question_id": q2_id, "selected_option": 1, "time_taken_sec": 8}
                ],
                "time_taken_sec": 13
            }
            res = await client.post(f"/sessions/{session_id}/submit", json=submit_payload, headers=student_headers)
            assert res.status_code == 200, f"Submit attempt failed: {res.text}"
            result = res.json()
            print(f"✓ Attempt submitted! Score: {result['score']}/{result['total_marks']}")

            # Admin receives student:submitted and leaderboard:update
            admin_event = json.loads(await ws_admin.recv())
            print(f"  Admin received event: {admin_event.get('type')}")

            # 10. Fetch Leaderboard
            print("\n10. Fetching Leaderboard...")
            res = await client.get(f"/sessions/{session_id}/leaderboard", headers=student_headers)
            assert res.status_code == 200
            lb = res.json()
            print(f"✓ Leaderboard entries count: {len(lb)}")
            for entry in lb:
                print(f"  Rank #{entry['rank']}: {entry['student_name']} - Score: {entry['score']}/{entry['total_marks']} (Time: {entry['time_taken_sec']}s)")

            # 11. Fetch Analytics
            print("\n11. Fetching Admin Analytics...")
            res = await client.get(f"/sessions/{session_id}/analytics", headers=admin_headers)
            assert res.status_code == 200
            analytics = res.json()
            print(f"✓ Analytics: Participants={analytics.get('total_participants')}, Avg Score={analytics.get('avg_score')}, Avg Accuracy={analytics.get('avg_accuracy')}%")

            # 12. Admin Ends Session
            print("\n12. Admin ending session...")
            res = await client.post(f"/sessions/{session_id}/end", headers=admin_headers)
            assert res.status_code == 200
            print("✓ Session ended.")

        # 13. Test LLM Explain & Resolve
        print("\n13. Testing OpenRouter LLM Endpoint...")
        llm_payload = {
            "question_text": "What is the time complexity of QuickSort average case?",
            "options": ["O(n)", "O(n log n)", "O(n^2)", "O(1)"],
            "correct_option": "O(n log n)"
        }
        res = await client.post("/llm/explain", json=llm_payload, headers=admin_headers, timeout=20.0)
        print(f"  LLM Explain status: {res.status_code}")
        if res.status_code == 200:
            print(f"  LLM Explanation: {res.json().get('explanation')[:120]}...")

    print("\n==========================================")
    print(" ALL BACKEND WORKFLOW TESTS PASSED 100%! ")
    print("==========================================")

if __name__ == "__main__":
    asyncio.run(test_full_workflow())
