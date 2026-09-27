-- ============================================
-- Astrova P1.41 — Authoritative Heritage Sources
-- ============================================
-- Registers 4 authoritative heritage data sources
-- Adds UNESCO Intangible Cultural Heritage records
-- Attaches source attribution to heritage entities
-- ============================================

-- ---- 1. Register Authoritative Sources ----

-- Indian Culture Portal (Ministry of Culture, Government of India)
INSERT INTO sources (title, source_type, verification_status, publisher, url, notes) VALUES
  ('Indian Culture Portal', 'GOVERNMENT', 'VERIFIED', 'Ministry of Culture, Government of India',
   'https://www.indianculture.gov.in/',
   'Official platform hosting cultural heritage data from repositories and institutions across India. Includes manuscripts, museum collections, archival records, rare books, artworks, and audiovisual materials.')
ON CONFLICT DO NOTHING;

-- Incredible India (Ministry of Tourism, Government of India)
INSERT INTO sources (title, source_type, verification_status, publisher, url, notes) VALUES
  ('Incredible India', 'GOVERNMENT', 'VERIFIED', 'Ministry of Tourism, Government of India',
   'https://www.incredibleindia.gov.in/',
   'Official tourism portal providing heritage place information, travel guides, and cultural reference for destinations across India.')
ON CONFLICT DO NOTHING;

-- UNESCO Intangible Cultural Heritage (distinct from World Heritage List)
INSERT INTO sources (title, source_type, verification_status, publisher, url, notes) VALUES
  ('UNESCO Intangible Cultural Heritage', 'UNESCO', 'VERIFIED', 'UNESCO',
   'https://ich.unesco.org/en',
   'International reference for intangible cultural heritage including performing arts, oral traditions, festivals, rituals, handicrafts, and traditional knowledge.')
ON CONFLICT DO NOTHING;

-- National Archives of India
INSERT INTO sources (title, source_type, verification_status, publisher, url, notes) VALUES
  ('National Archives of India', 'ARCHIVE', 'VERIFIED', 'National Archives of India, Ministry of Culture',
   'https://nationalarchives.nic.in/',
   'Repository of public records, private papers, oriental records, cartographic records, and microfilms. Established 1891. Largest archival repository in South Asia.')
ON CONFLICT DO NOTHING;

-- ---- 2. Link Existing Heritage Entities to Authoritative Sources ----
-- Where UNESCO ICH already exists in Astrova, attach the UNESCO ICH source

-- Garba — inscribed on UNESCO ICH list in 2023
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1)
WHERE LOWER(name) = 'garba'
  AND source_id IS NULL;

-- Bhangra — closely related to UNESCO ICH traditions of Punjab
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1)
WHERE LOWER(name) = 'bhangra'
  AND source_id IS NULL;

-- Bharatanatyam — major classical dance referenced by Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'bharatanatyam'
  AND source_id IS NULL;

-- ---- 3. Add UNESCO Intangible Cultural Heritage Entities (India) ----
-- These are verified UNESCO ICH elements inscribed for India
-- Only adding entities NOT already in Astrova

-- Kutiyattam, Sanskrit Theatre (Kerala, 2008)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Kutiyattam', 'tradition',
   'Ancient Sanskrit theatre tradition of Kerala performed by Chakyar and Nangyaramma castes. One of the oldest surviving theatrical traditions in the world, dating back to the Sangam era. Uses elaborate costumes, makeup, and codified hand gestures. Inscribed on UNESCO Intangible Cultural Heritage list in 2008.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Tradition of Vedic Chanting (Pan-India, 2008)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Vedic Chanting', 'tradition',
   'Sacred tradition of chanting Sanskrit mantras from the Vedas. An integral part of Vedic study and memorization passed down orally for millennia. Recognized by UNESCO as Masterpiece of Oral and Intangible Heritage in 2003 and inscribed on the Representative List in 2008.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Ramlila (North India, 2008)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Ramlila', 'festival',
   'Traditional performance of the Ramayana epic. A dramatic re-enactment of Lord Rama''s life story performed across North India, especially during Dussehra. Combines theatre, music, narration, and devotional practice. Inscribed on UNESCO ICH list in 2008.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Chhau Dance (West Bengal, Jharkhand, Odisha, 2010)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Chhau Dance', 'tradition',
   'Semi-classical Indian dance combining martial arts, tribal and folk traditions. Three styles exist: Purulia Chhau (West Bengal), Saraikela Chhau (Jharkhand), and Mayurbhanj Chhau (Odisha). Uses masked and unmasked forms to depict stories from epics. Inscribed on UNESCO ICH list in 2010.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Kalbelia Folk Songs and Dances (Rajasthan, 2010)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Kalbelia', 'tradition',
   'Traditional folk songs and dances of the Kalbelia community of Rajasthan. The Kalbelia were historically snake charmers whose dance mimics serpent movements. Performed to the accompaniment of the been (pungi) instrument and dholak drum. Inscribed on UNESCO ICH list in 2010.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Mudiyettu (Kerala, 2010)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Mudiyettu', 'tradition',
   'Ritual theatre and dance drama of Kerala depicting the battle between Goddess Kali and the demon Darika. Performed in Bhadrakali temples during the Vishu season. Combines dance, music, and elaborate face painting. Inscribed on UNESCO ICH list in 2010.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Buddhist Chanting of Ladakh (2012)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Buddhist Chanting of Ladakh', 'tradition',
   'Recitation of sacred Buddhist texts in the trans-Himalayan Ladakh region. Performed by monks of various sects including Kagyud, Nyngma, Geluk, and Shakya. Preserves ancient oral traditions of Tibetan Buddhism in the Indian Himalayas. Inscribed on UNESCO ICH list in 2012.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Sankirtana (Manipur, 2013)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Sankirtana', 'tradition',
   'Ritual singing, drumming, and dancing of Manipur narrating stories of Vaishnava God Krishna. Central to Meitei community life, performed during ceremonies, festivals, and lifecycle events. Combines vocal music, percussion, and movement. Inscribed on UNESCO ICH list in 2013.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Traditional Brass and Copper Craft of Thatheras (Punjab, 2014)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Thathera Brass Craft', 'craft',
   'Traditional brass and copper craft of utensil making among the Thatheras of Jandiala Guru, Punjab. Artisans produce hand-hammered vessels using techniques passed down through generations. The craft produces distinctive glowing brassware prized for its quality. Inscribed on UNESCO ICH list in 2014.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Navroz (Pan-India, 2016, transnational)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Navroz', 'festival',
   'Persian New Year celebrated by the Parsi community in India. Marks the spring equinox and symbolizes renewal and new beginnings. Involves special prayers, festive meals, cleaning of homes, and wearing new clothes. Shared with multiple countries. Inscribed on UNESCO ICH list in 2016.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Yoga (Pan-India, 2016)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Yoga', 'tradition',
   'Ancient Indian physical, mental, and spiritual practice combining postures (asanas), breathing techniques (pranayama), and meditation. Originated in ancient India and is now practiced worldwide. June 21 is celebrated as International Yoga Day. Inscribed on UNESCO ICH list in 2016.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Kumbh Mela (Haridwar, Prayagraj, Nashik, Ujjain, 2017)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Kumbh Mela', 'festival',
   'Largest peaceful gathering in the world. A major Hindu pilgrimage and festival held four times over 12 years at four sacred riverbank locations: Haridwar, Prayagraj, Nashik-Trimbak, and Ujjain. Devotees bathe in sacred rivers seeking spiritual purification. Inscribed on UNESCO ICH list in 2017.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Durga Puja (Kolkata, 2021)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Durga Puja', 'festival',
   'Annual festival celebrating Goddess Durga''s victory over the buffalo demon Mahishasur. Kolkata''s celebration is a massive cultural event featuring elaborate pandals (temporary structures), idol craftsmanship, music, dance, and community gatherings. Inscribed on UNESCO ICH list in 2021.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Deepavali (Pan-India, 2025)
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Deepavali', 'festival',
   'Festival of lights symbolizing the victory of light over darkness, good over evil, and knowledge over ignorance. Celebrated across India with oil lamps (diyas), fireworks, sweets, and family gatherings. Commemorates the return of Lord Rama to Ayodhya. Inscribed on UNESCO ICH list in 2025.',
   (SELECT id FROM sources WHERE title = 'UNESCO Intangible Cultural Heritage' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- ---- 4. Add Incredible India Referenced Heritage Entities ----
-- Heritage places highlighted on incredibleindia.gov.in that are NOT yet in Astrova

-- Red Fort — already exists, source attribution via UNESCO World Heritage
-- Qutub Minar — already exists
-- Golden Temple — already exists

-- Dwarkadhish Temple (Gujarat) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Dwarkadhish Temple', 'monument',
   'Ancient Hindu temple dedicated to Lord Krishna in Dwarka, Gujarat. Believed to have been built over 2,500 years ago by Lord Krishna''s grandson Vajranabh. One of the Char Dham pilgrimage sites. The temple stands at the confluence of the Gomti River and the Arabian Sea.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Virupaksha Temple (Karnataka) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Virupaksha Temple', 'monument',
   'Historic Hindu temple at Hampi, Karnataka. Part of the Group of Monuments at Hampi (UNESCO World Heritage). The temple has been in continuous operation since the 7th century. Features a 50-meter tall gopuram (gateway tower) and is the main functioning temple at Hampi.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Shore Temple (Tamil Nadu) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Shore Temple', 'monument',
   'UNESCO World Heritage structural stone temple of the 8th century at Mamallapuram, Tamil Nadu. One of the earliest important structural temples in South India. Built during the Pallava dynasty, it overlooks the Bay of Bengal and is part of the Group of Monuments at Mamallapuram.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Kamakhya Temple (Assam) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Kamakhya Temple', 'monument',
   'Ancient Hindu temple atop Nilachal Hill in Guwahati, Assam. Dedicated to Goddess Kamakhya, an incarnation of Sati. One of the oldest of the 51 Shakti Pithas. The temple''s beehive-shaped sanctum is a unique architectural feature. Hosts the annual Ambubachi Mela.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Mahabodhi Temple (Bihar) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Mahabodhi Temple', 'monument',
   'UNESCO World Heritage Buddhist temple in Bodh Gaya, Bihar. Marks the location where Lord Buddha is said to have attained enlightenment under the Bodhi Tree. The current structure dates to the 5th-6th century CE and is one of the earliest and most important Buddhist temples.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Victoria Memorial (West Bengal) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Victoria Memorial', 'monument',
   'Marble memorial in Kolkata dedicated to Queen Victoria. Built between 1906-1921 in Indo-Saracenic Revival architecture blending British, Mughal, Venetian, Egyptian, Deccani, and Islamic influences. Now houses a museum with a large collection of artifacts from the colonial period.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Charminar (Telangana) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Charminar', 'monument',
   'Iconic mosque and monument in Hyderabad, Telangana. Built in 1591 by Muhammad Quli Qutb Shah to commemorate the end of a deadly plague. Features four grand arches and four minarets. The surrounding area is one of the busiest markets in Hyderabad.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Gateway of India (Maharashtra) — from Incredible India
INSERT INTO heritage_entities (name, category, description, source_id, location_id, period_id) VALUES
  ('Gateway of India', 'monument',
   'Iconic arch monument in Mumbai, Maharashtra. Built in 1924 to commemorate the landing of King George V and Queen Mary. Indo-Saracenic architecture combining Roman triumphal arch elements with Hindu and Muslim architectural motifs. Faces the Arabian Sea at Apollo Bunder.',
   (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1),
   NULL, NULL)
ON CONFLICT DO NOTHING;

-- Hawa Mahal — already exists, link to Incredible India
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1)
WHERE LOWER(name) = 'hawa mahal'
  AND source_id IS NULL;

-- Amber Fort — already exists, link to Incredible India
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Incredible India' LIMIT 1)
WHERE LOWER(name) = 'amber fort'
  AND source_id IS NULL;

-- Sanchi Stupa — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'sanchi stupa'
  AND source_id IS NULL;

-- Khajuraho Temples — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'khajuraho temples'
  AND source_id IS NULL;

-- Ajanta Caves — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'ajanta caves'
  AND source_id IS NULL;

-- Ellora Caves — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'ellora caves'
  AND source_id IS NULL;

-- Meenakshi Amman Temple — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'meenakshi amman temple'
  AND source_id IS NULL;

-- Chola Bronzes — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'chola bronzes'
  AND source_id IS NULL;

-- Warli Art — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'warli art'
  AND source_id IS NULL;

-- Blue Pottery — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'blue pottery'
  AND source_id IS NULL;

-- Phulkari — already exists, link to Indian Culture Portal
UPDATE heritage_entities
SET source_id = (SELECT id FROM sources WHERE title = 'Indian Culture Portal' LIMIT 1)
WHERE LOWER(name) = 'phulkari'
  AND source_id IS NULL;

-- ---- 5. Verify ----
DO $$
DECLARE
  source_count INTEGER;
  heritage_count INTEGER;
  with_source INTEGER;
  unesco_ich_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_count FROM sources;
  SELECT COUNT(*) INTO heritage_count FROM heritage_entities;
  SELECT COUNT(*) INTO with_source FROM heritage_entities WHERE source_id IS NOT NULL;
  SELECT COUNT(*) INTO unesco_ich_count FROM heritage_entities he
    JOIN sources s ON he.source_id = s.id
    WHERE s.title = 'UNESCO Intangible Cultural Heritage';

  RAISE NOTICE '=== AUTHORITATIVE SOURCES INTEGRATION RESULTS ===';
  RAISE NOTICE 'Total sources: %', source_count;
  RAISE NOTICE 'Total heritage entities: %', heritage_count;
  RAISE NOTICE 'Heritage entities with source attribution: %', with_source;
  RAISE NOTICE 'UNESCO ICH heritage entities: %', unesco_ich_count;
END $$;
