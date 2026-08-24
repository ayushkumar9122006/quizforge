#!/usr/bin/env python3
"""
QuizForge Seed Script
Creates demo admin, demo student, and two sample quizzes with multiple sections.
Run: python seed.py
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from database.config import AsyncSessionLocal, init_db
from crud.user import create_user, get_user_by_email
from crud.quiz import create_quiz, publish_quiz
from schemas.user import UserCreate
from schemas.quiz import QuizCreate, QuestionCreate, OptionCreate
from models.all_models import UserRole


# ── Quiz 1: Computer Science Fundamentals ─────────────────────────────────────
CS_QUIZ = QuizCreate(
    title="Computer Science Fundamentals",
    description="Covers data structures, algorithms, networking, and JavaScript basics.",
    time_per_q_sec=300,
    subject="Computer Science",
    difficulty="medium",
    tags=["CS", "algorithms", "web", "javascript"],
    questions=[
        QuestionCreate(
            order_index=0, section="Section A — Data Structures",
            text="What is the time complexity of binary search on a sorted array?",
            correct_answer=1, marks=2,
            options=[
                OptionCreate(order_index=0, text="O(n)"),
                OptionCreate(order_index=1, text="O(log n)"),
                OptionCreate(order_index=2, text="O(n log n)"),
                OptionCreate(order_index=3, text="O(1)"),
            ]
        ),
        QuestionCreate(
            order_index=1, section="Section A — Data Structures",
            text="Which data structure uses the LIFO (Last In First Out) principle?",
            correct_answer=1, marks=2,
            options=[
                OptionCreate(order_index=0, text="Queue"),
                OptionCreate(order_index=1, text="Stack"),
                OptionCreate(order_index=2, text="Heap"),
                OptionCreate(order_index=3, text="Linked List"),
            ]
        ),
        QuestionCreate(
            order_index=2, section="Section A — Data Structures",
            text="What is the worst-case time complexity of QuickSort?",
            correct_answer=3, marks=2,
            options=[
                OptionCreate(order_index=0, text="O(n log n)"),
                OptionCreate(order_index=1, text="O(n)"),
                OptionCreate(order_index=2, text="O(log n)"),
                OptionCreate(order_index=3, text="O(n²)"),
            ]
        ),
        QuestionCreate(
            order_index=3, section="Section B — Networking & Web",
            text="What does HTTP stand for?",
            correct_answer=0, marks=1,
            options=[
                OptionCreate(order_index=0, text="HyperText Transfer Protocol"),
                OptionCreate(order_index=1, text="High Transfer Text Protocol"),
                OptionCreate(order_index=2, text="Hyper Transmission Text Protocol"),
                OptionCreate(order_index=3, text="HyperText Transmission Protocol"),
            ]
        ),
        QuestionCreate(
            order_index=4, section="Section B — Networking & Web",
            text="Which HTTP status code means 'Not Found'?",
            correct_answer=2, marks=1,
            options=[
                OptionCreate(order_index=0, text="200"),
                OptionCreate(order_index=1, text="301"),
                OptionCreate(order_index=2, text="404"),
                OptionCreate(order_index=3, text="500"),
            ]
        ),
        QuestionCreate(
            order_index=5, section="Section B — Networking & Web",
            text="What does DNS stand for?",
            correct_answer=0, marks=1,
            options=[
                OptionCreate(order_index=0, text="Domain Name System"),
                OptionCreate(order_index=1, text="Dynamic Network Service"),
                OptionCreate(order_index=2, text="Data Network Standard"),
                OptionCreate(order_index=3, text="Digital Name Server"),
            ]
        ),
        QuestionCreate(
            order_index=6, section="Section C — JavaScript",
            text="What is the output of typeof null in JavaScript?",
            correct_answer=2, marks=2,
            options=[
                OptionCreate(order_index=0, text="null"),
                OptionCreate(order_index=1, text="undefined"),
                OptionCreate(order_index=2, text="object"),
                OptionCreate(order_index=3, text="string"),
            ]
        ),
        QuestionCreate(
            order_index=7, section="Section C — JavaScript",
            text="Which method removes the last element from an array in JavaScript?",
            correct_answer=1, marks=2,
            options=[
                OptionCreate(order_index=0, text="shift()"),
                OptionCreate(order_index=1, text="pop()"),
                OptionCreate(order_index=2, text="splice()"),
                OptionCreate(order_index=3, text="slice()"),
            ]
        ),
        QuestionCreate(
            order_index=8, section="Section C — JavaScript",
            text="What does === check in JavaScript compared to ==?",
            correct_answer=0, marks=2,
            options=[
                OptionCreate(order_index=0, text="Both value and type (strict equality)"),
                OptionCreate(order_index=1, text="Only value (loose equality)"),
                OptionCreate(order_index=2, text="Only type"),
                OptionCreate(order_index=3, text="Reference equality"),
            ]
        ),
        QuestionCreate(
            order_index=9, section="Section C — JavaScript",
            text="Which sorting algorithm has the best average-case time complexity?",
            correct_answer=2, marks=2,
            options=[
                OptionCreate(order_index=0, text="Bubble Sort"),
                OptionCreate(order_index=1, text="Insertion Sort"),
                OptionCreate(order_index=2, text="Merge Sort"),
                OptionCreate(order_index=3, text="Selection Sort"),
            ]
        ),
    ]
)

# ── Quiz 2: Python & Databases ────────────────────────────────────────────────
PYTHON_QUIZ = QuizCreate(
    title="Python & Databases",
    description="Covers Python fundamentals and SQL/database concepts.",
    time_per_q_sec=240,
    subject="Python",
    difficulty="easy",
    tags=["python", "sql", "databases"],
    questions=[
        QuestionCreate(
            order_index=0, section="Section A — Python Basics",
            text="Which keyword is used to define a function in Python?",
            correct_answer=1, marks=1,
            options=[
                OptionCreate(order_index=0, text="function"),
                OptionCreate(order_index=1, text="def"),
                OptionCreate(order_index=2, text="func"),
                OptionCreate(order_index=3, text="define"),
            ]
        ),
        QuestionCreate(
            order_index=1, section="Section A — Python Basics",
            text="What is the output of print(type([])) in Python?",
            correct_answer=0, marks=1,
            options=[
                OptionCreate(order_index=0, text="<class 'list'>"),
                OptionCreate(order_index=1, text="<class 'array'>"),
                OptionCreate(order_index=2, text="list"),
                OptionCreate(order_index=3, text="<type 'list'>"),
            ]
        ),
        QuestionCreate(
            order_index=2, section="Section A — Python Basics",
            text="Which of the following is immutable in Python?",
            correct_answer=2, marks=2,
            options=[
                OptionCreate(order_index=0, text="List"),
                OptionCreate(order_index=1, text="Dictionary"),
                OptionCreate(order_index=2, text="Tuple"),
                OptionCreate(order_index=3, text="Set"),
            ]
        ),
        QuestionCreate(
            order_index=3, section="Section A — Python Basics",
            text="What does the 'self' parameter represent in a Python class method?",
            correct_answer=0, marks=2,
            options=[
                OptionCreate(order_index=0, text="The current instance of the class"),
                OptionCreate(order_index=1, text="The class itself"),
                OptionCreate(order_index=2, text="A static reference"),
                OptionCreate(order_index=3, text="The parent class"),
            ]
        ),
        QuestionCreate(
            order_index=4, section="Section B — SQL & Databases",
            text="Which SQL statement is used to retrieve data from a database?",
            correct_answer=0, marks=1,
            options=[
                OptionCreate(order_index=0, text="SELECT"),
                OptionCreate(order_index=1, text="GET"),
                OptionCreate(order_index=2, text="FETCH"),
                OptionCreate(order_index=3, text="RETRIEVE"),
            ]
        ),
        QuestionCreate(
            order_index=5, section="Section B — SQL & Databases",
            text="What does PRIMARY KEY constraint ensure in a database table?",
            correct_answer=1, marks=2,
            options=[
                OptionCreate(order_index=0, text="Values can be NULL"),
                OptionCreate(order_index=1, text="Unique and non-null identification of each row"),
                OptionCreate(order_index=2, text="Values must be numeric"),
                OptionCreate(order_index=3, text="The column is indexed automatically only"),
            ]
        ),
        QuestionCreate(
            order_index=6, section="Section B — SQL & Databases",
            text="Which SQL JOIN returns all rows from both tables, with NULLs where no match?",
            correct_answer=3, marks=2,
            options=[
                OptionCreate(order_index=0, text="INNER JOIN"),
                OptionCreate(order_index=1, text="LEFT JOIN"),
                OptionCreate(order_index=2, text="RIGHT JOIN"),
                OptionCreate(order_index=3, text="FULL OUTER JOIN"),
            ]
        ),
    ]
)


async def seed():
    print("=" * 50)
    print("  QuizForge Seed Script")
    print("=" * 50)
    print("\nInitialising database…")
    await init_db()

    async with AsyncSessionLocal() as db:

        # ── Admin ───────────────────────────────────────────────────────────────
        admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@quizforge.com")
        admin_pass  = os.getenv("SEED_ADMIN_PASSWORD", "Admin@123")
        existing    = await get_user_by_email(db, admin_email)
        if not existing:
            admin = await create_user(db, UserCreate(
                email=admin_email, name="Demo Admin",
                password=admin_pass, role=UserRole.admin
            ))
            print(f"✓ Admin created:   {admin_email}  /  {admin_pass}")
        else:
            admin = existing
            print(f"• Admin exists:    {admin_email}")

        # ── Student ─────────────────────────────────────────────────────────────
        student_email = os.getenv("SEED_STUDENT_EMAIL", "student@quizforge.com")
        student_pass  = os.getenv("SEED_STUDENT_PASSWORD", "Student@123")
        if not await get_user_by_email(db, student_email):
            await create_user(db, UserCreate(
                email=student_email, name="Demo Student",
                password=student_pass, role=UserRole.student
            ))
            print(f"✓ Student created: {student_email}  /  {student_pass}")
        else:
            print(f"• Student exists:  {student_email}")

        # ── Extra student ────────────────────────────────────────────────────────
        s2_email = "student2@quizforge.com"
        if not await get_user_by_email(db, s2_email):
            await create_user(db, UserCreate(
                email=s2_email, name="Priya Sharma",
                password="Student@123", role=UserRole.student
            ))
            print(f"✓ Student2 created: {s2_email}  /  Student@123")

        # ── Quiz 1 ───────────────────────────────────────────────────────────────
        quiz1 = await create_quiz(db, CS_QUIZ, admin.id)
        await publish_quiz(db, quiz1.id)
        print(f"✓ Quiz created & published: '{CS_QUIZ.title}' ({len(CS_QUIZ.questions)} questions, 3 sections)")

        # ── Quiz 2 ───────────────────────────────────────────────────────────────
        quiz2 = await create_quiz(db, PYTHON_QUIZ, admin.id)
        await publish_quiz(db, quiz2.id)
        print(f"✓ Quiz created & published: '{PYTHON_QUIZ.title}' ({len(PYTHON_QUIZ.questions)} questions, 2 sections)")

        await db.commit()

    print("\n" + "=" * 50)
    print("  Seed complete!")
    print("=" * 50)
    print(f"\n  Admin:    {admin_email}  /  {admin_pass}")
    print(f"  Student:  {student_email}  /  {student_pass}")
    print(f"  Student2: {s2_email}  /  Student@123")
    print("\n  Start the server: uvicorn main:app --reload")
    print("  API docs:         http://localhost:8000/docs")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(seed())
