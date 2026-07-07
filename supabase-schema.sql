-- ================================================================
-- Amber L&D Dashboard — Supabase Schema
-- Run this in Supabase SQL Editor to set up all tables
-- ================================================================

-- 1. SPOC Users (login credentials)
CREATE TABLE IF NOT EXISTS spoc_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_code text UNIQUE NOT NULL,
  name text NOT NULL,
  branch text,
  email text,
  password text NOT NULL,
  role text DEFAULT 'spoc' CHECK (role IN ('admin', 'spoc')),
  created_at timestamptz DEFAULT now()
);

-- 2. Employee Master
CREATE TABLE IF NOT EXISTS employee_master (
  emp_code text PRIMARY KEY,
  emp_name text NOT NULL,
  branch text,
  grade text,
  gender text,
  designation text,
  department text,
  date_of_joining date,
  updated_at timestamptz DEFAULT now()
);

-- 3. Training MIS (monthly records)
CREATE TABLE IF NOT EXISTS training_mis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_code text NOT NULL,
  emp_name text,
  branch text,
  gender text,
  grade text,
  month text,
  training_categories text,
  total_man_hours numeric DEFAULT 0,
  training_date date,
  trainer_name text,
  training_mode text,
  designation text,
  department text,
  uploaded_by text,
  uploaded_at timestamptz DEFAULT now()
);

-- 4. Content Library
CREATE TABLE IF NOT EXISTS content_library (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  url text NOT NULL,
  category text,
  type text DEFAULT 'Other',
  description text,
  added_by text,
  added_at timestamptz DEFAULT now()
);

-- 5. TNI Responses
CREATE TABLE IF NOT EXISTS tni_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_code text NOT NULL,
  emp_name text,
  branch text,
  role_title text,
  topic text NOT NULL,
  priority text CHECK (priority IN ('High', 'Moderate', 'Low')),
  financial_year text DEFAULT '2026-27',
  uploaded_at timestamptz DEFAULT now()
);

-- 6. Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name text,
  emp_code text,
  branch text,
  role text,
  action text,
  details text,
  created_at timestamptz DEFAULT now()
);

-- 7. Password Reset Log
CREATE TABLE IF NOT EXISTS password_reset_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_by text,
  changed_by_role text,
  account_changed text,
  branch text,
  action text,
  created_at timestamptz DEFAULT now()
);

-- ================================================================
-- Row Level Security (RLS) — SPOCs see only their branch data
-- ================================================================

ALTER TABLE training_mis ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_master ENABLE ROW LEVEL SECURITY;

-- Allow read to authenticated users (handled in app layer for now)
CREATE POLICY "Allow all for now" ON training_mis FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON employee_master FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON spoc_users FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON audit_log FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON content_library FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON tni_responses FOR ALL USING (true);
CREATE POLICY "Allow all for now" ON password_reset_log FOR ALL USING (true);

-- ================================================================
-- Seed Admin User
-- ================================================================

INSERT INTO spoc_users (emp_code, name, branch, email, password, role)
VALUES ('ADMIN', 'HR Admin', NULL, 'admin@ambergroupindia.com', 'Amber@Admin2026', 'admin')
ON CONFLICT (emp_code) DO NOTHING;
