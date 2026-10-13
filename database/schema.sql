CREATE DATABASE IF NOT EXISTS chantier_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chantier_pro;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  access_code_hash VARCHAR(255) NOT NULL,
  role ENUM('ENGINEER','RESOURCE_MANAGER','SITE_MANAGER','ANALYST') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  project_type VARCHAR(100) NULL,
  description VARCHAR(1000) NULL,
  reference_code VARCHAR(60) NULL,
  location VARCHAR(180) NULL,
  built_area_m2 DECIMAL(14,2) NULL,
  floor_count SMALLINT UNSIGNED NULL,
  estimated_budget DECIMAL(18,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'XOF',
  start_date DATE NULL,
  target_end_date DATE NULL,
  status ENUM('PLANNING','ACTIVE','PAUSED','COMPLETED') NOT NULL DEFAULT 'PLANNING',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  current_stock DECIMAL(16,4) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(16,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_material_stock CHECK (current_stock >= 0),
  CONSTRAINT chk_material_minimum CHECK (minimum_stock >= 0),
  UNIQUE KEY uq_material_name_unit (name, unit)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(40) NULL,
  name VARCHAR(180) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  planned_quantity DECIMAL(16,4) NOT NULL,
  completed_quantity DECIMAL(16,4) NOT NULL DEFAULT 0,
  progress_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
  target_daily_quantity DECIMAL(16,4) NULL,
  start_date DATE NULL,
  due_date DATE NULL,
  status ENUM('DRAFT','READY','ACTIVE','COMPLETED') NOT NULL DEFAULT 'DRAFT',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_task_quantity CHECK (planned_quantity > 0 AND completed_quantity >= 0 AND completed_quantity <= planned_quantity),
  CONSTRAINT chk_task_progress CHECK (progress_percent >= 0 AND progress_percent <= 100),
  KEY idx_tasks_project_status (project_id, status, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS task_materials (
  task_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  quantity_per_unit DECIMAL(16,6) NOT NULL,
  PRIMARY KEY (task_id, material_id),
  CONSTRAINT fk_task_materials_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_materials_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT chk_task_material_ratio CHECK (quantity_per_unit > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  report_date DATE NOT NULL,
  progress_quantity DECIMAL(16,4) NOT NULL,
  progress_percent_delta DECIMAL(6,3) NOT NULL DEFAULT 0,
  note VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_report_progress CHECK (progress_quantity >= 0 AND progress_percent_delta >= 0 AND progress_percent_delta <= 100),
  KEY idx_reports_task_date (task_id, report_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_materials (
  report_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(16,4) NOT NULL,
  PRIMARY KEY (report_id, material_id),
  CONSTRAINT fk_report_materials_report FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_materials_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT chk_report_material_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  material_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM('OPENING','IN','OUT','ADJUSTMENT') NOT NULL,
  quantity DECIMAL(16,4) NOT NULL,
  balance_after DECIMAL(16,4) NOT NULL,
  report_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movements_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_movements_report FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE RESTRICT,
  CONSTRAINT fk_movements_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_movements_material_date (material_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prediction_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  baseline_percent DECIMAL(6,3) NOT NULL,
  predicted_percent_7d DECIMAL(6,3) NOT NULL,
  logistic_success_probability DECIMAL(7,6) NULL,
  normal_success_probability DECIMAL(7,6) NULL,
  uniform_success_probability DECIMAL(7,6) NULL,
  sample_days INT UNSIGNED NOT NULL DEFAULT 0,
  model_version VARCHAR(30) NOT NULL DEFAULT 'rules-v1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_snapshots_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_snapshots_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  KEY idx_snapshots_project_date (project_id, created_at)
) ENGINE=InnoDB;
