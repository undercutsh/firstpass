// GET /api/models — the tier→model mapping (skills/firstpass/models.md).
import { getModels } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getModels);
