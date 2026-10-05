-- =====================================================
-- AI-Based Question & Answer Web Application
-- Database Schema (MySQL 8.4)
-- =====================================================

-- 1. Database banana
CREATE DATABASE IF NOT EXISTS ai_qa_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_qa_app;

-- 2. USERS table: student ka account / login info
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt se encrypted password
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. SUBJECTS table: topic/subject list
CREATE TABLE IF NOT EXISTS subjects (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- 4. CHATS table: har question aur uska AI answer (history)
CREATE TABLE IF NOT EXISTS chats (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  subject_id INT NULL,
  question   TEXT NOT NULL,
  answer     MEDIUMTEXT NOT NULL,                -- AI ke lambe answers ke liye
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  INDEX idx_user_time (user_id, created_at)      -- history jaldi load karne ke liye
);

-- 5. Default subjects daalna
INSERT IGNORE INTO subjects (name) VALUES
  ('General'),
  ('DBMS'),
  ('Java'),
  ('Python'),
  ('C Programming'),
  ('Data Structures'),
  ('Operating Systems'),
  ('Computer Networks'),
  ('Web Development'),
  ('Mathematics');
