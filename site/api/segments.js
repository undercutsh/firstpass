// GET /api/segments — the editor + provider-setup segment router behind /setup.
import { getSegments } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getSegments);
