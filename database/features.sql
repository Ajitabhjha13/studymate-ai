-- =====================================================
-- New features: roles, answer language, PDF notes
-- Ek hi baar chalana hai (mysql> prompt mein):
--   source E:/Ninja Project/ai-qa-app/database/features.sql;
-- =====================================================
USE ai_qa_app;

-- 1. Users: role (student/admin) aur answer ki language
ALTER TABLE users
  ADD COLUMN role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  ADD COLUMN answer_language ENUM('english', 'hindi', 'hinglish') NOT NULL DEFAULT 'english';

-- 2. Uploaded PDF notes (file disk par, details yahan)
CREATE TABLE IF NOT EXISTS documents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  name        VARCHAR(255) NOT NULL,      -- original file ka naam
  file_name   VARCHAR(255) NOT NULL,      -- server par saved naam
  size_bytes  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doc_user (user_id, created_at)
);

-- 3. PDF se puche gaye sawaal-jawab
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

-- 4. Khud ko admin banana (apna email daalo):
-- UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
