-- ================================================================
-- Run this AFTER supabase-schema.sql
-- Inserts all 35 HR SPOCs into spoc_users table
-- Password format: First4Letters(TitleCase) + @ + EmpCode
-- ================================================================

INSERT INTO spoc_users (emp_code, name, branch, email, password, role) VALUES
  ('3826',     'VINIT KUMAR',              'SP FAN DIVISION',     'hrsp@ambergroupindia.com',             'Vini@3826',     'spoc'),
  ('ILS2654',  'INDU RAJPUT',              'ILJIN',               'indu.rajput@iljin.co.in',              'Indu@ILS2654',  'spoc'),
  ('ST0049',   'NUTAN MAURYA',             'ILJIN NOIDA',         'HR.Training@iljin.co.in',              'Nuta@ST0049',   'spoc'),
  ('3870',     'VARSHA SHARMA',            'NOIDA SEC 90',        'support.hr90@ambergroupindia.com',     'Vars@3870',     'spoc'),
  ('3890',     'RATNESH TIWARI',           'KASNA ROBOTIC',       'hr.robotics@ambergroupindia.com',      'Ratn@3890',     'spoc'),
  ('3743',     'INDU CHAUDHARY',           'ECOTECH EXTENSION I', 'hrecotech1@ambergroupindia.com',       'Indu@3743',     'spoc'),
  ('PTSS1157', 'ANSHIKA PARIHAR',          'PRAVARTAKA GN',       'anshika.parihar@ptsnoida.in',         'Ansh@PTSS1157', 'spoc'),
  ('3071',     'DEVKUMAR RAMESH KAPURE',   'SUPA FAN DIVISION',   'devkumarkapure@ambergroupindia.com',   'Devk@3071',     'spoc'),
  ('3687',     'ABHIJEET VASANT PAWAR',    'PUNE',                'abhijeet.pawar@ambergroupindia.com',   'Abhi@3687',     'spoc'),
  ('4023',     'MONISH SRI D',             'CHENNAI',             'recruitment.chn@ambergroupindia.com',  'Moni@4023',     'spoc'),
  ('ILSC1148', 'UMA KATHIRVEL',            'ILJIN CHENNAI',       'Careers.chn@iljin.co.in',             'Uma@ILSC1148',  'spoc'),
  ('PTSSC048', 'ARUL MARY A',              'PRAVARTAKA C',        'hr.chennai@ptsnoida.in',               'Arul@PTSSC048', 'spoc'),
  ('3527',     'PARAMSETTY THULASI',       'SRI CITY',            'sricityhr.p2@ambergroupindia.com',     'Para@3527',     'spoc'),
  ('3413',     'KAUSHAL KISHOR',           'PANTNAGAR',           'hr.rdr@ambergroupindia.com',            'Kaus@3413',     'spoc'),
  ('3144',     'ANKIT KANNOJIYA',          'DDN 4',               'ankitkannojiya@ambergroupindia.com',   'Anki@3144',     'spoc'),
  ('1826',     'AKSHAY KUMAR',             'DDN 5',               'akshayu5@ambergroupindia.com',         'Aksh@1826',     'spoc'),
  ('2745',     'ABHAY PRATAP SINGH',       'DDN 6',               'abhaypratap@ambergroupindia.com',      'Abha@2745',     'spoc'),
  ('2938',     'BHAWANA RAWAT',            'RUDRAPUR',            'bhawnarawat@ambergroupindia.com',      'Bhaw@2938',     'spoc'),
  ('1682',     'UTTAM SINGH',              'JHAJJAR I',           'hr_jh@ambergroupindia.com',            'Utta@1682',     'spoc'),
  ('3686',     'AKKI KAUR',                'JHAJJAR II OPS',      'akki.kaur@ambergroupindia.com',        'Akki@3686',     'spoc'),
  ('3927',     'MONIKA',                   'JHAJJAR II R&D',      'MONIKA.YADAV@AMBERGROUPINDIA.COM',     'Moni@3927',     'spoc'),
  ('PI10725',  'SHALU KUMARI',             'PICL',                'shalu@piclindia.com',                  'Shal@PI10725',  'spoc'),
  ('731',      'KAMALPREET',               'RAJPURA OPS',         'hr_rjp@ambergroupindia.com',           'Kama@731',      'spoc'),
  ('3675',     'SOURBH KUMAR',             'RAJPURA R&D',         'sourbh.kumar@ambergroupindia.com',     'Sour@3675',     'spoc'),
  ('SR00304',  'NEETU SINGH',              'SIDWAL',              'neetu@sidwal.com',                     'Neet@SR00304',  'spoc'),
  ('ES488',    'SANJU KANHU SAWANT',       'ILJIN PUNE',          'sanju@iljin.co.in',                    'Sanj@ES488',    'spoc'),
  ('SG2467',   'MAHESH',                   'SHOGINI',             'sttimeoffice@shogini.com',             'Mahe@SG2467',   'spoc'),
  ('ILS2676',  'JANARDHANA V',             'POWER ONE',           'Janardhana.v@iljin.co.in',             'Jana@ILS2676',  'spoc'),
  ('AC622',    'BHARGAVI',                 'ASCENT CIRCUITS',     'hr@ascentcircuits.com',                'Bhar@AC622',    'spoc'),
  ('AC622-B',  'SUDHAKARA S',              'ASCENT CIRCUITS',     'sudhakara@ascentcircuits.com',         'Sudh@AC622',    'spoc')
ON CONFLICT (emp_code) DO NOTHING;
