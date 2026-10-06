// GET /api/clients — every coding agent with a verified Undercut companion page.
import { getClients } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(() => ({ count: getClients().length, clients: getClients() }));
