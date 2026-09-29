-- ==============================================================================
-- DMBBHR Attendance & Payroll Schema (MySQL / MariaDB)
-- Designed for Philippine Time (UTC+08:00) & Auditable Biometric Scans
-- Supports Multi-Branch (DBB Cebu, DBB Negros, DBB Iloilo)
-- ==============================================================================

-- 1. Locations / Branches
CREATE TABLE IF NOT EXISTS `locations` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `address` VARCHAR(255) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Initial locations
INSERT IGNORE INTO `locations` (`id`, `code`, `name`, `is_active`) VALUES
('loc-cebu', 'CEB', 'DBB Cebu', 1),
('loc-negros', 'NEG', 'DBB Negros', 0),
('loc-iloilo', 'ILO', 'DBB Iloilo', 0);

-- 2. Biometric Devices
CREATE TABLE IF NOT EXISTS `devices` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `model` VARCHAR(100) NOT NULL DEFAULT 'BISMAC BISBIO B-29b',
  `ip_address` VARCHAR(45) NOT NULL,
  `port` INT NOT NULL DEFAULT 4370,
  `serial_number` VARCHAR(100) NOT NULL UNIQUE,
  `location_id` VARCHAR(36) NOT NULL,
  `status` ENUM('online', 'offline', 'error') DEFAULT 'offline',
  `last_seen` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE
);

INSERT IGNORE INTO `devices` (`id`, `name`, `model`, `ip_address`, `port`, `serial_number`, `location_id`, `status`) VALUES
('dev-1', 'Main Entrance B-29b', 'BISMAC BISBIO B-29b', '192.168.1.201', 4370, '0476141400046', 'loc-cebu', 'online');

-- 3. Users (System Login & Access Control)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'hr', 'viewer') DEFAULT 'admin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Employees & Biometric User Mapping
CREATE TABLE IF NOT EXISTS `employees` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_number` VARCHAR(50) NOT NULL UNIQUE,
  `biometric_user_id` VARCHAR(50) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `middle_name` VARCHAR(100) NULL,
  `department` VARCHAR(100) NOT NULL,
  `position` VARCHAR(100) NOT NULL,
  `location_id` VARCHAR(36) NOT NULL,
  `basic_salary` DECIMAL(12, 2) DEFAULT 0.00,
  `status` ENUM('active', 'inactive', 'on_leave') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_biometric_uid` (`biometric_user_id`),
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`)
);

-- 5. Raw Biometric Attendance Logs (Immutable Audit Table)
CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(50) NOT NULL, -- Raw User ID from reader (e.g. 5009, 25013)
  `employee_id` VARCHAR(36) NULL,
  `attendance_time` TIMESTAMP NOT NULL,
  `type` TINYINT NOT NULL DEFAULT 1, -- Raw type
  `state` TINYINT NOT NULL DEFAULT 1, -- Raw state
  `serial_number` INT NOT NULL DEFAULT 0, -- Raw record counter
  `device_id` VARCHAR(36) NOT NULL,
  `device_ip` VARCHAR(45) NOT NULL,
  `location_id` VARCHAR(36) NOT NULL,
  `is_duplicate` BOOLEAN DEFAULT FALSE,
  `raw_payload` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_att_user_time` (`user_id`, `attendance_time`),
  INDEX `idx_att_location` (`location_id`),
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`),
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`),
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);

-- 6. Shift Schedules
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `grace_period_mins` INT DEFAULT 15,
  `break_hours` DECIMAL(3, 1) DEFAULT 1.0,
  `location_id` VARCHAR(36) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`)
);

-- 7. Daily Processed Attendance (Aggregated from Raw Logs)
CREATE TABLE IF NOT EXISTS `attendance_days` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `first_in` TIMESTAMP NULL,
  `break_out` TIMESTAMP NULL,
  `break_in` TIMESTAMP NULL,
  `final_out` TIMESTAMP NULL,
  `rendered_hours` DECIMAL(5, 2) DEFAULT 0.00,
  `late_minutes` INT DEFAULT 0,
  `undertime_minutes` INT DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'Regular',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_emp_date` (`employee_id`, `date`),
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);

-- 8. Leave Requests
CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `leave_type` VARCHAR(50) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `days` DECIMAL(3, 1) NOT NULL DEFAULT 1.0,
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  `reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);

-- 9. Overtime Authorizations
CREATE TABLE IF NOT EXISTS `overtime` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `hours` DECIMAL(4, 2) NOT NULL,
  `purpose` TEXT NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);

-- 10. Holidays
CREATE TABLE IF NOT EXISTS `holidays` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `date` DATE NOT NULL,
  `type` ENUM('regular', 'special_non_working') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Payroll Periods
CREATE TABLE IF NOT EXISTS `payroll_periods` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `payout_date` DATE NOT NULL,
  `location_id` VARCHAR(36) NOT NULL,
  `status` ENUM('draft', 'processing', 'closed') DEFAULT 'draft',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`)
);

-- 12. Payroll Records
CREATE TABLE IF NOT EXISTS `payroll_records` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `payroll_period_id` VARCHAR(36) NOT NULL,
  `employee_id` VARCHAR(36) NOT NULL,
  `basic_salary` DECIMAL(12, 2) NOT NULL,
  `rendered_days` DECIMAL(4, 1) NOT NULL,
  `late_deduction` DECIMAL(12, 2) DEFAULT 0.00,
  `undertime_deduction` DECIMAL(12, 2) DEFAULT 0.00,
  `overtime_pay` DECIMAL(12, 2) DEFAULT 0.00,
  `holiday_pay` DECIMAL(12, 2) DEFAULT 0.00,
  `gross_pay` DECIMAL(12, 2) NOT NULL,
  `sss_deduction` DECIMAL(10, 2) DEFAULT 0.00,
  `philhealth_deduction` DECIMAL(10, 2) DEFAULT 0.00,
  `pagibig_deduction` DECIMAL(10, 2) DEFAULT 0.00,
  `withholding_tax` DECIMAL(10, 2) DEFAULT 0.00,
  `net_pay` DECIMAL(12, 2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`),
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);
