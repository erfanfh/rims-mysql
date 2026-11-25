-- Apply to the existing database before deploying the application.
CREATE TABLE IF NOT EXISTS target_feedback (
  assessment_id CHAR(36) NOT NULL,
  question_id VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (assessment_id, question_id),
  CONSTRAINT fk_target_feedback_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_target_feedback_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
