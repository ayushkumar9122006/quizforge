"""
Demo data for the JEE progress analytics — LOCAL TESTING ONLY.

Creates 4 "JEE Main Full Syllabus Test" quizzes (Physics/Chemistry/Maths,
MCQ + numerical sections) and 8 demo students with different learning curves
(improving, steady, declining), submits every test through the real API, and
spreads the attempts over ~6 weeks so the progress curves look realistic.

Usage (backend running on :8000, `python seed.py` already run):
    cd backend
    python seed_jee_demo.py            # API defaults to http://localhost:8000
    API_URL=http://localhost:8000 python seed_jee_demo.py

Logins afterwards: admin@quizforge.com / Admin@123,
students e.g. diya@example.com / Student@123 (aarav, diya, kabir, ananya,
rohan, ishita, vivaan, sara).
Do NOT run this against a production database.
"""
import asyncio, os, random, sys
from datetime import datetime, timedelta
import httpx
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database.config import engine, settings  # noqa: E402

API = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
ADMIN_EMAIL = os.getenv("DEMO_ADMIN_EMAIL", "admin@quizforge.com")
ADMIN_PASSWORD = os.getenv("DEMO_ADMIN_PASSWORD", "Admin@123")
random.seed(7)

STEMS = {
    "Physics": {
        "Kinematics": "A projectile is launched with velocity 20 m/s at 30 degrees. Find the horizontal range of the trajectory.",
        "Laws of Motion": "A block on an inclined plane with coefficient of friction 0.3 is connected over a pulley. Find the tension in the string.",
        "Rotational Motion": "A solid sphere is rolling without slipping. Find its moment of inertia and angular momentum about the axis.",
        "Electrostatics": "Two point charges create an electric field. Using Coulomb's law find the electric potential at the midpoint.",
        "Current Electricity": "In a Wheatstone bridge each resistor has resistance 10 ohm. Using Kirchhoff's laws find the current.",
        "Ray Optics": "An object is placed 20 cm from a convex lens of focal length 10 cm. Find the magnification.",
        "Thermodynamics": "An ideal gas undergoes an adiabatic process in a Carnot heat engine. Find the efficiency of engine.",
        "Semiconductors and Electronic Devices": "Identify the output of the logic gate circuit made of a p-n junction diode and transistor (NAND).",
    },
    "Chemistry": {
        "Some Basic Concepts of Chemistry": "Calculate the molarity of a solution: 4 g NaOH; find moles and limiting reagent using stoichiometry.",
        "Atomic Structure": "Which set of quantum numbers is valid for an electron in a 3d orbital according to the Pauli principle?",
        "Chemical Bonding and Molecular Structure": "Predict the hybridisation and shape of XeF4 using VSEPR theory and its bond angle.",
        "Chemical Kinetics": "For a first order reaction the rate constant is 0.693 per min. Find the half-life using Arrhenius data.",
        "Electrochemistry": "Using the Nernst equation calculate the cell potential of a galvanic cell with electrode potential 0.34 V.",
        "Coordination Compounds": "Find the crystal field stabilisation energy (CFSE) of the complex with strong field ligand.",
        "General Organic Chemistry": "Arrange the carbocation stability considering inductive effect, resonance and hyperconjugation.",
        "Aldehydes, Ketones and Carboxylic Acids": "Which aldehyde undergoes Cannizzaro reaction but gives negative aldol condensation?",
    },
    "Mathematics": {
        "Complex Numbers": "If z is a complex number with modulus 1 and argument pi/3, find z^3 using De Moivre.",
        "Matrices and Determinants": "If A is a 3x3 matrix with determinant 5, find the determinant of adjoint of A.",
        "Permutations and Combinations": "In how many ways can a committee of 4 be selected from 6 men and 5 women?",
        "Limits, Continuity and Differentiability": "Evaluate the limit as x tends to 0 of (sin 3x)/x and check continuity.",
        "Definite Integration": "Evaluate the definite integral of x sin x from 0 to pi using properties of definite integrals.",
        "Conic Sections": "Find the eccentricity of the ellipse and the length of its latus rectum.",
        "Vector Algebra": "Find the scalar triple product of three vectors and the projection of one on another.",
        "Probability": "Two dice are thrown. Using conditional probability find the probability the sum is 8 given the first is even.",
    },
}

# student -> (base skill, improvement per test, per-chapter weakness)
STUDENTS = [
    ("Aarav Sharma", 0.72, 0.04, {"Rotational Motion": -0.5, "Electrochemistry": -0.4}),
    ("Diya Patel", 0.55, 0.07, {"Definite Integration": -0.45, "Coordination Compounds": -0.3}),
    ("Kabir Singh", 0.62, -0.06, {"Ray Optics": -0.4, "Probability": -0.4}),
    ("Ananya Gupta", 0.80, 0.01, {"Chemical Kinetics": -0.35}),
    ("Rohan Verma", 0.40, 0.08, {"Rotational Motion": -0.3, "Complex Numbers": -0.35, "General Organic Chemistry": -0.3}),
    ("Ishita Rao", 0.66, 0.0, {"Electrostatics": -0.45, "Conic Sections": -0.3}),
    ("Vivaan Mehta", 0.50, 0.03, {"Rotational Motion": -0.4, "Definite Integration": -0.35}),
    ("Sara Khan", 0.58, 0.05, {"Atomic Structure": -0.35, "Vector Algebra": -0.3}),
]


def build_quiz(idx: int) -> dict:
    questions = []
    order = 0
    for subj, stems in STEMS.items():
        chapters = list(stems.keys())
        random.shuffle(chapters)
        mcq, num = chapters[:6], chapters[6:8]
        for ch in mcq:
            questions.append({
                "order_index": order, "section": f"{subj} – Section A (MCQ)", "subject": subj,
                # tag ~70% explicitly by "admin"; leave the rest for auto-tag
                "chapter": ch if random.random() < 0.7 else None,
                "text": f"[T{idx+1}] " + stems[ch], "question_type": "single_correct",
                "correct_answer": random.randint(0, 3), "positive_marks": 4, "negative_marks": 1,
                "options": [{"order_index": j, "text": f"Option {j+1}", "content_type": "text"} for j in range(4)],
                "_chapter_truth": ch,
            })
            order += 1
        for ch in num:
            questions.append({
                "order_index": order, "section": f"{subj} – Section B (Numerical)", "subject": subj,
                "chapter": ch if random.random() < 0.7 else None,
                "text": f"[T{idx+1}] " + stems[ch], "question_type": "numerical",
                "raw_answer": str(random.randint(1, 50)), "positive_marks": 4, "negative_marks": 1,
                "options": [], "_chapter_truth": ch,
            })
            order += 1
    return {
        "title": f"JEE Main Full Syllabus Test {idx + 1}",
        "total_duration_minutes": 180, "time_per_q_sec": 300,
        "instructions": "Full syllabus mock.", "questions": questions,
    }


async def main():
    host = settings.database_url.split("@")[-1].split("/")[0]
    if not any(h in host for h in ("localhost", "127.0.0.1", "db:")) and "--force" not in sys.argv:
        sys.exit(f"Refusing to seed demo data into a non-local database ({host}). Use a local DATABASE_URL (or pass --force).")

    async with httpx.AsyncClient(base_url=API, timeout=60) as c:
        r = await c.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if r.status_code != 200:
            sys.exit(f"Admin login failed ({r.status_code}). Run `python seed.py` first, or set DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD.")
        tok = r.json()["access_token"]
        A = {"Authorization": f"Bearer {tok}"}

        quizzes = []
        for i in range(4):
            payload = build_quiz(i)
            truth = {q["order_index"]: q.pop("_chapter_truth") for q in payload["questions"]}
            r = await c.post("/quizzes/", json=payload, headers=A); r.raise_for_status()
            quiz = r.json()
            await c.post(f"/quizzes/{quiz['id']}/publish", headers=A)
            quizzes.append((quiz, truth))
        print("created quizzes", len(quizzes))

        # Auto-tag the untagged questions of test 1..4 (keyword fallback: no AI key in tests)
        agree = total = 0
        for quiz, truth in quizzes:
            r = await c.post(f"/quizzes/{quiz['id']}/chapters/auto-tag", headers=A); r.raise_for_status()
            for q in r.json()["questions"]:
                if q["chapter_source"] == "keyword":
                    total += 1
                    agree += q["chapter"] == truth[q["order_index"]]
        print(f"keyword auto-tag accuracy on seeded stems: {agree}/{total}")

        student_tokens = []
        for name, *_ in STUDENTS:
            email = name.split()[0].lower() + "@example.com"
            await c.post("/auth/register", json={"email": email, "name": name, "password": "Student@123"})
            t = (await c.post("/auth/login", json={"email": email, "password": "Student@123"})).json()["access_token"]
            student_tokens.append(t)

        base_date = datetime.utcnow() - timedelta(days=42)
        spread = []
        for ti, (quiz, truth) in enumerate(quizzes):
            full = (await c.get(f"/quizzes/{quiz['id']}", headers=A)).json()
            for si, (name, skill, slope, weak) in enumerate(STUDENTS):
                if ti == 3 and si == 7:
                    continue  # Sara missed the last test
                H = {"Authorization": f"Bearer {student_tokens[si]}"}
                r = await c.post(f"/quizzes/{quiz['id']}/start-attempt", headers=H); r.raise_for_status()
                sess = r.json()["session_id"]
                answers = []
                for q in full["questions"]:
                    ch = truth[q["order_index"]]
                    p = skill + slope * ti + weak.get(ch, 0.0)
                    # weakness slowly fades for improving students
                    if slope > 0.03 and ch in weak:
                        p += 0.08 * ti
                    p = max(0.05, min(0.97, p))
                    attempt_p = 0.85 if p > 0.35 else 0.5
                    r_t = random.random()
                    t_sec = random.randint(6, 18) if r_t < 0.08 else random.randint(250, 420) if r_t < 0.16 else random.randint(40, 200)
                    entry = {"question_id": q["id"], "selected_option": None, "response_text": None, "time_taken_sec": t_sec}
                    if random.random() < attempt_p:
                        right = random.random() < (p * 0.5 if t_sec < 20 else p * 0.8 if t_sec > 240 else p)
                        if q["question_type"] == "numerical":
                            entry["response_text"] = q["raw_answer"] if right else str(int(q["raw_answer"]) + 3)
                        else:
                            entry["selected_option"] = q["correct_answer"] if right else (q["correct_answer"] + 1) % 4
                    answers.append(entry)
                r = await c.post(f"/sessions/{sess}/submit", json={"answers": answers, "time_taken_sec": random.randint(7000, 10500)}, headers=H)
                r.raise_for_status()
                # spread tests over weeks
                when = base_date + timedelta(days=10 * ti, minutes=si * 7)
                spread.append({"s": when, "st": when - timedelta(hours=3), "id": r.json()["id"]})
            print("test", ti + 1, "submitted")

    async with engine.begin() as conn:
        await conn.execute(text("UPDATE attempts SET submitted_at=:s, started_at=:st WHERE id=:id"), spread)
    await engine.dispose()
    print("\nDone. Log in as diya@example.com / Student@123 → My Progress, or as the admin → Students & Progress.")


asyncio.run(main())