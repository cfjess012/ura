-- S4.7 — a risk assessor belongs to a risk domain.
--
-- "Leave it to us" lets a requester hand a question to a person OR to a
-- domain. A domain hand-off has to reach somebody, so the domain lives on
-- the person: it is the routing table, and it is grounded in the eleven
-- risk areas the instrument already has rather than a second taxonomy
-- nobody maintains.
--
-- Null for requesters and admins. Noah Kahan stays deliberately null: the
-- generalist who picks up whatever has no named owner.
alter table people add column if not exists risk_domain text;

comment on column people.risk_domain is
  'A category key from the Tier-1 instrument, or null. Assessors only.';

insert into people (id, name, role, title, email, signs_in, risk_domain) values
  ('a.privacy',   'Rania Haddad',   'assessor', 'Privacy Officer',                  'rania.haddad@stelly.com',   true, 'data-privacy'),
  ('a.security',  'Diego Marquez',  'assessor', 'Security Risk Lead',               'diego.marquez@stelly.com',  true, 'security-resilience'),
  ('a.legal',     'Fiona Callaghan','assessor', 'Regulatory Counsel',               'fiona.callaghan@stelly.com',true, 'legal-regulatory'),
  ('a.thirdparty','Samuel Okonkwo', 'assessor', 'Third-Party Risk Manager',         'samuel.okonkwo@stelly.com', true, 'third-party'),
  ('a.ai',        'Mei Lin Tan',    'assessor', 'AI Governance Lead',               'meilin.tan@stelly.com',     true, 'ai'),
  ('a.governance','Harold Whitmore', 'assessor', 'Data Governance Lead',            'harold.whitmore@stelly.com',true, 'governance'),
  ('a.arch',      'Ivan Petrov',    'assessor', 'Enterprise Security Architect',    'ivan.petrov@stelly.com',    true, 'solution-architecture'),
  ('a.operational','Bea Lindqvist',  'assessor', 'Operational Resilience Manager',   'bea.lindqvist@stelly.com',  true, 'operational'),
  ('a.ethics',    'Tobias Nkemdirim','assessor', 'Conduct & Ethics Advisor',        'tobias.nkemdirim@stelly.com',true,'ethics-conduct'),
  ('a.people',    'Clara Denton',   'assessor', 'Workforce Risk Partner',           'clara.denton@stelly.com',   true, 'people-capacity'),
  ('a.jurisdiction','Aisha Bello',  'assessor', 'Cross-Border Compliance Lead',     'aisha.bello@stelly.com',    true, 'jurisdiction')
on conflict (id) do nothing;

-- The generalist keeps no domain on purpose.
update people set title = 'Risk Assessor — general queue' where id = 'p.assessor';
