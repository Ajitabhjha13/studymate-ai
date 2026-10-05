-- =====================================================
-- LOCAL database update: PDFs ab database mein save hongi
-- Ek baar chalao (mysql> prompt mein):
--   source E:/Ninja Project/ai-qa-app/database/pdf_storage.sql;
-- =====================================================
USE ai_qa_app;
ALTER TABLE documents ADD COLUMN file_data LONGBLOB NULL;
