USE chantier_pro;
DELIMITER //
DROP PROCEDURE IF EXISTS add_project_characteristics //
CREATE PROCEDURE add_project_characteristics()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='project_type') THEN
    ALTER TABLE projects ADD COLUMN project_type VARCHAR(100) NULL AFTER name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='description') THEN
    ALTER TABLE projects ADD COLUMN description VARCHAR(1000) NULL AFTER project_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='built_area_m2') THEN
    ALTER TABLE projects ADD COLUMN built_area_m2 DECIMAL(14,2) NULL AFTER location;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='floor_count') THEN
    ALTER TABLE projects ADD COLUMN floor_count SMALLINT UNSIGNED NULL AFTER built_area_m2;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='estimated_budget') THEN
    ALTER TABLE projects ADD COLUMN estimated_budget DECIMAL(18,2) NULL AFTER floor_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='currency') THEN
    ALTER TABLE projects ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'XOF' AFTER estimated_budget;
  END IF;
END //
CALL add_project_characteristics() //
DROP PROCEDURE add_project_characteristics //
DELIMITER ;
