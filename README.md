<div align="center">

# 🎓 StudyMate AI

**An AI-powered study assistant for college students**

Ask questions subject-wise, chat with your own PDF notes, take AI-generated quizzes and get personalised revision suggestions, powered by Google Gemini.

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini_API-8E75B2?logo=googlegemini&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-HTML_CSS_JS-F7DF1E?logo=javascript&logoColor=black)

*BCA Project · Parul University · Ajitabh Kumar Jha*

</div>

---

## About the project

Students spend a lot of time searching for answers across many websites, and the information is often scattered or hard to understand. **StudyMate AI** gives them one place to ask academic questions in plain language and get clear, step-by-step answers, with every conversation saved by subject for quick revision.

![Dashboard](docs/screenshots/dashboard.png)

## Features

| Feature | What it does |
|---|---|
| **Subject-wise AI chat** | 10 subjects (DBMS, Java, Python, OS, CN, DS and more), each with its own conversation. The AI remembers the last 4 messages for follow-up questions. |
| **Chat with your notes** | Upload a PDF (up to 10 MB) and ask questions from it. Answers come from the PDF, with page references where possible. |
| **AI quizzes** | Generate 5 or 10 MCQs on any subject or topic at easy, medium or hard level. Answers are checked on the server, followed by a full review with explanations. |
| **Smart revision suggestions** | Rule-based recommendations from quiz scores and activity (weak subjects, weak topics, subjects not revised recently), plus an AI-generated 3-day study plan. |
| **Dashboard** | Stats, day streak, a GitHub-style yearly activity heatmap and subject progress. |
| **History** | Grouped by date, searchable with highlighted matches, filterable by subject and exportable as Markdown. |
| **Voice** | Speak your question (speech-to-text) and listen to answers (text-to-speech). |
| **Answer language** | English, Hinglish or Hindi, applied to chat, PDF answers and study plans. |
| **Admin panel** | Usage stats, a 30-day questions chart, subject popularity, quiz performance, and user management (make admin, delete). |
| **Developer-style UX** | `Ctrl + K` command palette, keyboard shortcuts, streaming answers, code blocks with copy buttons, fully responsive. |

## Screenshots

| Login | AI Chat |
|---|---|
| ![Login](docs/screenshots/login.png) | ![Chat](docs/screenshots/chat.png) |

| Quiz result | My Notes (PDF) |
|---|---|
| ![Quiz](docs/screenshots/quiz.png) | ![Notes](docs/screenshots/notes.png) |

| History | Admin panel |
|---|---|
| ![History](docs/screenshots/history.png) | ![Admin](docs/screenshots/admin.png) |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL 8.4 |
| AI | Google Gemini API (`@google/genai`) |
| Security | bcrypt password hashing, JWT authentication, DOMPurify, role-based access |
| Libraries | marked (Markdown), DOMPurify, Web Speech API |

## System architecture

```
Student ──▶ Web UI (HTML/CSS/JS) ──▶ Node.js + Express API ──▶ Google Gemini API
                                           │
                                           ▼
                                        MySQL
                     (users, subjects, chats, quizzes, documents, doc_chats)
```

The Gemini API key is kept on the server only. The browser never sees it.

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org) 18 or later
- [MySQL](https://dev.mysql.com/downloads/mysql/) 8.x
- A free [Gemini API key](https://aistudio.google.com)

### 1. Clone and install
```bash
git clone https://github.com/<your-username>/studymate-ai.git
cd studymate-ai/backend
npm install
```

### 2. Create the database
Log in with `mysql -u root -p` and run the three SQL files in order:
```sql
source path/to/studymate-ai/database/schema.sql;
source path/to/studymate-ai/database/quiz.sql;
source path/to/studymate-ai/database/features.sql;
```

### 3. Configure environment variables
Copy `backend/.env.example` to `backend/.env` and fill in your MySQL password, a JWT secret and your Gemini API key.

### 4. Run
```bash
cd backend
node server.js
```
Open **http://localhost:5000** in your browser.

### 5. Make an admin (optional)
Register an account, then run:
```sql
UPDATE ai_qa_app.users SET role = 'admin' WHERE email = 'your@email.com';
```

## Project structure

```
studymate-ai/
├── backend/
│   ├── server.js            # Express app and route setup
│   ├── db.js                # MySQL connection pool
│   ├── gemini.js            # Gemini helper with retry and fallback model
│   ├── helpers.js           # Tokens, language rules, file cleanup
│   ├── middleware/
│   │   ├── auth.js          # JWT check
│   │   └── admin.js         # Admin role check
│   └── routes/              # auth, ask, history, quiz, docs, insights, profile, admin, subjects
├── frontend/
│   ├── *.html               # login, register, dashboard, chat, docs, quiz, history, settings, admin
│   ├── css/style.css        # Design system
│   └── js/                  # One script per page + shared api, shell, icons, voice
└── database/
    ├── schema.sql           # users, subjects, chats
    ├── quiz.sql             # quizzes
    └── features.sql         # roles, language, documents, doc_chats
```

## API overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | Create account, log in |
| POST | `/api/ask` | Ask a subject question |
| GET / DELETE | `/api/history` | View, search and delete history |
| POST | `/api/quiz/generate` · `/api/quiz/:id/submit` | Create and submit a quiz |
| GET / POST / DELETE | `/api/docs` · `/api/docs/:id/ask` | Upload PDFs and ask from them |
| GET / POST | `/api/insights` · `/api/insights/plan` | Recommendations and AI study plan |
| GET / PUT / DELETE | `/api/profile` | Profile, language, password, account |
| GET / PATCH / DELETE | `/api/admin/*` | Admin stats and user management |

All endpoints except register and login require a `Bearer` token.

## Security highlights

- Passwords are hashed with **bcrypt** and never stored in plain text.
- **JWT** tokens protect every private API route.
- The **Gemini API key stays on the server**; the frontend only talks to our own backend.
- Admin access is checked against the **database on every request**, not just hidden in the UI.
- Quiz answers are **graded on the server**, so correct answers are never sent to the browser before submission.
- Uploaded files are verified as real PDFs by their file signature, and each user can only access their own files.
- AI output is sanitised with **DOMPurify** before it is shown, preventing XSS.
- All SQL queries use **parameterised statements**, preventing SQL injection.

## Future scope

- Android and iOS app
- Flashcards generated from saved answers
- Teacher accounts that assign quizzes to a class
- Image-based questions (photo of a textbook problem)

## Author

**Ajitabh Kumar Jha** · BCA, Parul University

---
<sub>Built as an academic project. AI answers can contain mistakes; verify important facts with your textbook.</sub>
