// GET /api/pricing — the published rate card (site/pricing.md).
import { getPricing } from './_lib/data.js';
import { readOnly } from './_lib/http.js';

export default readOnly(getPricing);
