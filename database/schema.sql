-- ============================================================================
-- Maharashtra Rajya Kendrapramukh v Adhikari Mahasangh
-- HostKarle MySQL Complete Schema (Covers BOTH Firebase Firestore + RTDB)
-- Charset: utf8mb4 (Full Marathi Devanagari + Emoji support)
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+05:30';

-- 1. Membership Applications & Approved Members (from Firestore `applications`)
CREATE TABLE IF NOT EXISTS `applications` (
  `id` VARCHAR(128) NOT NULL,
  `application_number` VARCHAR(64) NOT NULL DEFAULT '',
  `member_number` VARCHAR(64) NOT NULL DEFAULT '',
  `salutation` VARCHAR(32) NOT NULL DEFAULT '',
  `full_name` VARCHAR(255) NOT NULL DEFAULT '',
  `phone` VARCHAR(32) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `address` TEXT NULL,
  `district` VARCHAR(128) NOT NULL DEFAULT '',
  `taluka` VARCHAR(128) NOT NULL DEFAULT '',
  `center_name` VARCHAR(255) NOT NULL DEFAULT '',
  `family_members` VARCHAR(64) NOT NULL DEFAULT '',
  `hobby` VARCHAR(255) NOT NULL DEFAULT '',
  `education` VARCHAR(255) NOT NULL DEFAULT '',
  `professional_qualification` VARCHAR(255) NOT NULL DEFAULT '',
  `professional` VARCHAR(255) NOT NULL DEFAULT '',
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `reject_reason` TEXT NULL,
  `photo` LONGTEXT NULL,
  `payment_ref` VARCHAR(128) NOT NULL DEFAULT '',
  `payment_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
  `razorpay_payment_id` VARCHAR(128) NOT NULL DEFAULT '',
  `razorpay_order_id` VARCHAR(128) NOT NULL DEFAULT '',
  `is_official` TINYINT(1) NOT NULL DEFAULT 0,
  `official_post` VARCHAR(255) NOT NULL DEFAULT '',
  `official_district` VARCHAR(128) NOT NULL DEFAULT '',
  `official_taluka` VARCHAR(128) NOT NULL DEFAULT '',
  `approved_by` VARCHAR(128) NOT NULL DEFAULT '',
  `id_card_email_sent` TINYINT(1) NOT NULL DEFAULT 0,
  `id_card_email_sent_at` VARCHAR(64) NOT NULL DEFAULT '',
  `welcome_email_sent` TINYINT(1) NOT NULL DEFAULT 0,
  `welcome_email_sent_at` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  `approved_at` VARCHAR(64) NOT NULL DEFAULT '',
  `rejected_at` VARCHAR(64) NOT NULL DEFAULT '',
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  `extra_json` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_apps_phone` (`phone`),
  INDEX `idx_apps_status` (`status`),
  INDEX `idx_apps_member_number` (`member_number`),
  INDEX `idx_apps_application_number` (`application_number`),
  INDEX `idx_apps_email` (`email`(191)),
  INDEX `idx_apps_razorpay_order` (`razorpay_order_id`),
  INDEX `idx_apps_district` (`district`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. News & Announcements (from Firestore `news`)
CREATE TABLE IF NOT EXISTS `news` (
  `id` VARCHAR(128) NOT NULL,
  `title` VARCHAR(500) NOT NULL DEFAULT '',
  `publish_date` VARCHAR(64) NOT NULL DEFAULT '',
  `category` VARCHAR(128) NOT NULL DEFAULT '',
  `image_url` TEXT NULL,
  `summary` TEXT NULL,
  `content` LONGTEXT NULL,
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  INDEX `idx_news_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Homepage Latest Updates Carousel Banners (from Firestore `latest_banners`)
CREATE TABLE IF NOT EXISTS `latest_banners` (
  `id` VARCHAR(128) NOT NULL,
  `title` VARCHAR(500) NOT NULL DEFAULT '',
  `summary` TEXT NULL,
  `image_url` TEXT NOT NULL,
  `banner_date` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Government Orders & Circulars (from Firestore `gov_orders`)
CREATE TABLE IF NOT EXISTS `gov_orders` (
  `id` VARCHAR(128) NOT NULL,
  `title` VARCHAR(500) NOT NULL DEFAULT '',
  `order_date` VARCHAR(64) NOT NULL DEFAULT '',
  `order_type` VARCHAR(128) NOT NULL DEFAULT 'शासन निर्णय',
  `file_url` TEXT NULL,
  `drive_url` TEXT NULL,
  `summary` TEXT NULL,
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Contact Form Inquiries (from Firestore `contacts`)
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `phone` VARCHAR(64) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `district` VARCHAR(128) NOT NULL DEFAULT '',
  `subject` VARCHAR(500) NOT NULL DEFAULT '',
  `message` LONGTEXT NOT NULL,
  `photo` LONGTEXT NULL,
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Sub-Admins & 11-Permission RBAC (from Firestore `sub_admins`)
CREATE TABLE IF NOT EXISTS `sub_admins` (
  `id` VARCHAR(128) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `password` VARCHAR(255) NOT NULL DEFAULT '',
  `is_first_login` TINYINT(1) NOT NULL DEFAULT 1,
  `is_super_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `permissions_json` TEXT NOT NULL,
  `created_at` VARCHAR(64) NOT NULL DEFAULT '',
  `last_login_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sub_admin_email` (`email`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. System Settings & Atomic Member Counter (from Firestore `settings`)
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(128) NOT NULL,
  `setting_json` LONGTEXT NOT NULL,
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Website Daily & Total Visitor Stats (from Firestore `site_stats/visits`)
CREATE TABLE IF NOT EXISTS `site_stats` (
  `stat_key` VARCHAR(64) NOT NULL,
  `total_count` INT NOT NULL DEFAULT 5155,
  `today_count` INT NOT NULL DEFAULT 0,
  `last_date` VARCHAR(32) NOT NULL DEFAULT '',
  `last_updated` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`stat_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Dynamic Leadership Directory (Unified RTDB `dynamic_leaders` + Firestore `leadership`)
CREATE TABLE IF NOT EXISTS `leaders` (
  `id` VARCHAR(128) NOT NULL,
  `order_index` INT NOT NULL DEFAULT 0,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `role` VARCHAR(255) NOT NULL DEFAULT '',
  `region` VARCHAR(255) NOT NULL DEFAULT '',
  `education` VARCHAR(255) NOT NULL DEFAULT '',
  `phone` VARCHAR(64) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `photo` LONGTEXT NULL,
  `is_key` TINYINT(1) NOT NULL DEFAULT 0,
  `category` VARCHAR(128) NOT NULL DEFAULT '',
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  INDEX `idx_leaders_order` (`order_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Appointed Officials Directory (from Second Firebase RTDB `officials`)
CREATE TABLE IF NOT EXISTS `officials` (
  `id` VARCHAR(128) NOT NULL,
  `salutation` VARCHAR(32) NOT NULL DEFAULT 'श्री.',
  `first_name` VARCHAR(128) NOT NULL DEFAULT '',
  `middle_name` VARCHAR(128) NOT NULL DEFAULT '',
  `last_name` VARCHAR(128) NOT NULL DEFAULT '',
  `appointed_post` VARCHAR(255) NOT NULL DEFAULT '',
  `district` VARCHAR(128) NOT NULL DEFAULT '',
  `taluka` VARCHAR(128) NOT NULL DEFAULT '',
  `current_cadre` VARCHAR(128) NOT NULL DEFAULT '',
  `working_place` VARCHAR(255) NOT NULL DEFAULT '',
  `mobile` VARCHAR(32) NOT NULL DEFAULT '',
  `photo` LONGTEXT NULL,
  `appointed_date` VARCHAR(64) NOT NULL DEFAULT '',
  `order_number` VARCHAR(128) NOT NULL DEFAULT '',
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  INDEX `idx_officials_district` (`district`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Appointed Posts Catalog (from Second Firebase RTDB `custom_appointed_posts_v2`)
CREATE TABLE IF NOT EXISTS `appointed_posts` (
  `id` VARCHAR(128) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `level` VARCHAR(64) NOT NULL DEFAULT 'district',
  `extra_json` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_posts_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. District Appointment Passwords (from Second Firebase RTDB `district_passwords`)
CREATE TABLE IF NOT EXISTS `district_passwords` (
  `district` VARCHAR(128) NOT NULL,
  `password` VARCHAR(255) NOT NULL DEFAULT '',
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`district`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Leadership & Appointment Meta Keys (from Second Firebase RTDB `president_password`, `leadership_version`)
CREATE TABLE IF NOT EXISTS `leadership_meta` (
  `meta_key` VARCHAR(128) NOT NULL,
  `meta_value` TEXT NOT NULL,
  `updated_at` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`meta_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Safe Seed Rows (Do not overwrite existing values if already imported)
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_json`, `updated_at`)
VALUES
  ('member_counter', '{"totalApproved":1728,"lastMemberNumber":1728,"lastUpdated":""}', ''),
  ('admin_auth', '{"email":"padmakarshinde043@gmail.com","password":"Padmakar@2027","updatedAt":""}', '');

INSERT IGNORE INTO `site_stats` (`stat_key`, `total_count`, `today_count`, `last_date`, `last_updated`)
VALUES
  ('visits', 5155, 0, '', '');
