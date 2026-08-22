-- Owner call: a risk assessor is known by the office they speak for, not by
-- a job title. "Stella Blau — Privacy Office" tells a requester who to hand
-- a question to; "Privacy Officer" is HR's word for the same person and
-- helps nobody choose.
--
-- The title column now carries the office name. `risk_domain` is unchanged
-- and still the routing key, so what a person is CALLED and what they are
-- SENT are separate — a rename here can never misroute a hand-off.

update people set name = 'Jesse Blau',  title = 'AI Governance'        where id = 'a.ai';
update people set name = 'Stella Blau', title = 'Privacy Office'       where id = 'a.privacy';
update people set name = 'Simon Estes', title = 'Regulatory / Legal'   where id = 'a.legal';
update people set name = 'Rob Ulrich',  title = 'Enterprise Risk'      where id = 'a.operational';

update people set title = 'Information Security'  where id = 'a.security';
update people set title = 'Third-Party Risk'      where id = 'a.thirdparty';
update people set title = 'Data Governance'       where id = 'a.governance';
update people set title = 'Security Architecture' where id = 'a.arch';
update people set title = 'Ethics & Conduct'      where id = 'a.ethics';
update people set title = 'People Risk'           where id = 'a.people';
update people set title = 'Cross-Border'          where id = 'a.jurisdiction';

-- The generalist is an office too: whatever has no named owner.
update people set title = 'General Queue' where id = 'p.assessor';
