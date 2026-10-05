-- =====================================================
-- StudyMate AI: COMPLETE database setup for a NEW cloud MySQL server
-- (schema + quiz + features + PDF storage, all in one file)
-- =====================================================
CREATE DATABASE IF NOT EXISTS ai_qa_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_qa_app;

CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  answer_language ENUM('english', 'hindi', 'hinglish') NOT NULL DEFAULT 'english',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subjects (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS chats (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  subject_id INT NULL,
  question   TEXT NOT NULL,
  answer     MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  INDEX idx_user_time (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS quizzes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  subject_id   INT NULL,
  topic        VARCHAR(120) NULL,
  difficulty   ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  questions    JSON NOT NULL,
  answers      JSON NULL,
  score        INT NULL,
  total        INT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  INDEX idx_quiz_user (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS documents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  size_bytes  INT NOT NULL,
  file_data   LONGBLOB NULL,            -- PDF ka data (cloud par disk par nahi)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doc_user (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS doc_chats (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  user_id     INT NOT NULL,
  question    TEXT NOT NULL,
  answer      MEDIUMTEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  INDEX idx_docchat (document_id, created_at)
);

INSERT IGNORE INTO subjects (name) VALUES
  ('General'), ('DBMS'), ('Java'), ('Python'), ('C Programming'),
  ('Data Structures'), ('Operating Systems'), ('Computer Networks'),
  ('Web Development'), ('Mathematics');

-- Website par register karne ke baad khud ko admin banao:
-- UPDATE ai_qa_app.users SET role = 'admin' WHERE email = 'your@email.com';
