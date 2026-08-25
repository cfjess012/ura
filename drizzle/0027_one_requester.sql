-- One requester persona for the pilot: Isabelle Withers.
--
-- The sign-in picker is a demonstration device, and four requesters in it
-- asked a question nobody watching cares about — which of them am I? The
-- assessor personas stay, because the whole point of that side is that
-- different domains review different areas, and the roles are enforced for
-- real rather than simulated.
--
-- Nobody is deleted. `signs_in` is what the picker reads, and the directory
-- is a directory: a person who owned an assessment, answered a question or
-- was named as a business owner is still referenced by those rows, and
-- removing them would either break those references or quietly rewrite
-- somebody else's history.
update people set signs_in = false where role = 'requester' and id <> 'd.withers';
update people set signs_in = true where id = 'd.withers';
