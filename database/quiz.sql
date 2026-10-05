-- =====================================================
-- AI Quiz feature: naya table
-- Chalane ke liye (mysql> prompt mein):
--   source E:/Ninja Project/ai-qa-app/database/quiz.sql;
-- =====================================================
USE ai_qa_app;

CREATE TABLE IF NOT EXISTS quizzes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  subject_id   INT NULL,
  topic        VARCHAR(120) NULL,
  difficulty   ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  questions    JSON NOT NULL,          -- AI ke banaye MCQs (sahi answer ke saath)
  answers      JSON NULL,              -- student ne kya choose kiya
  score        INT NULL,
  total        INT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,

  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  INDEX idx_quiz_user (user_id, created_at)
);
