// GET /api/results — published benchmark summary computed from testing/results.
import { getResults } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getResults);
