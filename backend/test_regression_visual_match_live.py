import asyncio
import httpx
import os

BASE_URL = "http://localhost:8000"
PDF_PATH = "/Users/ayushkumar/Downloads/JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"
if not os.path.exists(PDF_PATH):
    PDF_PATH = "JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"

async def test_visual_match_pipeline():
    print(f"=== Running Live Visual Match Regression Test against {BASE_URL} ===")
    
    # 1. Login as Admin
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=120.0) as client:
        # Check health
        health = await client.get("/health")
        assert health.status_code == 200, f"Backend not healthy: {health.text}"
        print("✓ Backend is alive and reachable.")

        test_email = "visual_admin_test@quizforge.com"
        test_pass = "AdminPassword123!"
        login_res = await client.post("/auth/login", json={"email": test_email, "password": test_pass})
        if login_res.status_code != 200:
            reg_res = await client.post("/auth/register", json={
                "email": test_email,
                "password": test_pass,
                "name": "Visual Match Admin",
                "role": "admin"
            })
            assert reg_res.status_code in [200, 201], f"Register failed: {reg_res.text}"
            login_res = await client.post("/auth/login", json={"email": test_email, "password": test_pass})
        
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        print("✓ Authenticated as Admin.")

        # 2. Upload PDF to /quizzes/import/analyze-pdf
        print(f"Uploading PDF {PDF_PATH} for analysis...")
        with open(PDF_PATH, "rb") as f:
            files = {"file": ("test_goc.pdf", f, "application/pdf")}
            analyze_res = await client.post("/quizzes/import/analyze-pdf", files=files, headers=auth_headers)
        
        assert analyze_res.status_code == 200, f"Analyze failed: {analyze_res.text}"
        data = analyze_res.json()
        print(f"✓ Analysis complete: {data['total_questions']} questions extracted ({data['ready_count']} ready).")

        # 3. Locate Target Question: Nitrogen-base Match-the-Column question (Page 13, Q29)
        q29 = next((q for q in data["questions"] if q["question_number"] == 29), None)
        assert q29 is not None, "Question 29 not found in extracted questions!"
        
        print("\n--- Validating Question 29 (Nitrogen-base Match-the-Column) ---")
        print(f"Question Type: {q29['question_type']}")
        print(f"Source Page: {q29['source_page']} (spans: {q29['source_pages']})")
        print(f"Statement:\n{repr(q29['text'])}")
        
        # RULE 1: Preserve original table as ONE image in diagram
        assert q29["diagram"] is not None and q29["diagram"].startswith("data:image/png;base64,"), "Cropped diagram image missing!"
        print(f"✓ Rule 1 Passed: Original matching table cropped and attached to diagram field (length: {len(q29['diagram'])} bytes).")

        # RULE 2: Introductory statement contains only the intro, no reconstructed table rows or placeholders
        assert "Column-I" not in q29["text"] or "Column-I (" in q29["text"], "Column-I table header leaked into statement!"
        assert "Structure shown in diagram" not in q29["text"], "Generic placeholder found in statement!"
        assert "Image unavailable" not in q29["text"], "Generic placeholder found in statement!"
        assert "Column-II item" not in q29["text"], "Generic placeholder found in statement!"
        assert "Match each nitrogen base in Column-I" in q29["text"], "Introductory problem statement missing core instruction!"
        print("✓ Rule 2 Passed: Introductory statement extracted cleanly without reconstructed rows or placeholders.")

        # RULE 3: Extract options independently
        opts = [o["text"] for o in q29["options"]]
        print(f"Options extracted: {opts}")
        assert len(opts) == 4, f"Expected 4 options, got {len(opts)}"
        expected_opts = [
            "A-1, B-2, C-3, D-4",
            "A-1, B-4, C-2, D-3",
            "A-1, B-3, C-4, D-2",
            "A-3, B-1, C-4, D-2"
        ]
        for exp, act in zip(expected_opts, opts):
            assert exp.replace(" ", "") == act.replace(" ", ""), f"Option mismatch: expected '{exp}', got '{act}'"
        print("✓ Rule 3 Passed: All four options preserved exactly with ordering and mapping.")

        # RULE 4: Preserve the answer (Printed correct answer is A)
        print(f"Correct Answer Index: {q29['correct_answer']} (Raw Answer: {q29['raw_answer']})")
        assert q29["correct_answer"] == 0, f"Expected correct_answer 0 (A), got {q29['correct_answer']}"
        assert q29["raw_answer"] == "A", f"Expected raw_answer 'A', got {q29['raw_answer']}"
        print("✓ Rule 4 Passed: Correct answer A preserved.")

        # 4. RULE 5: Database persistence
        # Confirm import into a new quiz
        create_payload = {
            "title": "Live Visual Match Test Quiz",
            "description": "Automated verification for image-first match-the-column",
            "time_per_q_sec": 300,
            "is_public": False,
            "questions": [
                {
                    "order_index": 0,
                    "section": q29["section"],
                    "text": q29["text"],
                    "question_image": q29["question_image"],
                    "content_type": "text",
                    "correct_answer": q29["correct_answer"],
                    "raw_answer": q29["raw_answer"],
                    "question_type": q29["question_type"],
                    "match_data": q29["match_data"],
                    "explanation": f"PDF Page {q29['source_page']}",
                    "marks": q29["positive_marks"],
                    "positive_marks": q29["positive_marks"],
                    "negative_marks": q29["negative_marks"],
                    "diagram": q29["diagram"],
                    "options": [
                        {"order_index": oi, "text": o["text"], "content_type": "text"}
                        for oi, o in enumerate(q29["options"])
                    ]
                }
            ]
        }
        create_res = await client.post("/quizzes/", json=create_payload, headers=auth_headers)
        assert create_res.status_code == 201, f"Create quiz failed: {create_res.status_code} {create_res.text}"
        quiz_id = create_res.json()["id"]
        print(f"✓ Created test quiz {quiz_id} in PostgreSQL.")

        # Publish quiz
        pub_res = await client.post(f"/quizzes/{quiz_id}/publish", headers=auth_headers)
        assert pub_res.status_code == 200, f"Publish quiz failed: {pub_res.text}"
        print("✓ Quiz published successfully.")

        # Retrieve quiz as student / public
        fetch_res = await client.get(f"/quizzes/{quiz_id}", headers=auth_headers)
        assert fetch_res.status_code == 200, f"Fetch quiz failed: {fetch_res.text}"
        saved_quiz = fetch_res.json()
        saved_q = saved_quiz["questions"][0]

        assert saved_q["diagram"] == q29["diagram"], "Diagram image was corrupted or lost during database persistence!"
        assert saved_q["text"] == q29["text"], "Question statement changed during database persistence!"
        assert len(saved_q["options"]) == 4, "Options lost during persistence!"
        assert saved_q["correct_answer"] == 0, "Correct answer lost during persistence!"
        assert "Page 13" in saved_q["explanation"], "Page reference lost during persistence!"
        print("✓ Rule 5 Passed: Question and table image survive database persistence and publication.")

        # Test import/confirm into an existing quiz
        empty_quiz_payload = {
            "title": "Import Confirm Target Quiz",
            "time_per_q_sec": 300,
            "questions": []
        }
        eq_res = await client.post("/quizzes/", json=empty_quiz_payload, headers=auth_headers)
        assert eq_res.status_code == 201
        eq_id = eq_res.json()["id"]

        confirm_payload = {
            "questions": [
                {
                    "order_index": 0,
                    "section": q29["section"],
                    "text": q29["text"],
                    "question_image": q29["question_image"],
                    "content_type": "text",
                    "correct_answer": q29["correct_answer"],
                    "raw_answer": q29["raw_answer"],
                    "question_type": q29["question_type"],
                    "match_data": q29["match_data"],
                    "explanation": f"PDF Page {q29['source_page']}",
                    "marks": q29["positive_marks"],
                    "positive_marks": q29["positive_marks"],
                    "negative_marks": q29["negative_marks"],
                    "diagram": q29["diagram"],
                    "options": [
                        {"order_index": oi, "text": o["text"], "content_type": "text"}
                        for oi, o in enumerate(q29["options"])
                    ]
                }
            ]
        }
        confirm_res = await client.post(f"/quizzes/{eq_id}/import/confirm", json=confirm_payload, headers=auth_headers)
        assert confirm_res.status_code == 200, f"Confirm import failed: {confirm_res.text}"
        confirmed_quiz = confirm_res.json()
        assert len(confirmed_quiz["questions"]) == 1
        assert confirmed_quiz["questions"][0]["diagram"] == q29["diagram"]
        print("✓ Import confirmation endpoint /import/confirm verified successfully.")

        # Clean up test quizzes
        await client.delete(f"/quizzes/{quiz_id}", headers=auth_headers)
        await client.delete(f"/quizzes/{eq_id}", headers=auth_headers)
        print("✓ Cleanup completed.")

    print("\n🎉 ALL LIVE REGRESSION CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(test_visual_match_pipeline())
