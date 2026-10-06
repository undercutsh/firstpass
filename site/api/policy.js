// GET /api/policy — the routing policy (skills/firstpass/SKILL.md) as markdown.
import { getPolicy } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getPolicy);
