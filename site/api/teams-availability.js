// GET /api/teams-availability — founder-published Teams onboarding windows.
import { getTeamsAvailability } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getTeamsAvailability);
