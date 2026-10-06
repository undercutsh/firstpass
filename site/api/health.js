// GET /api/health — liveness plus the package version this deployment serves
// (.claude-plugin/plugin.json, via the generated snapshot).
import snapshot from './_lib/snapshot.js';
import { readOnly, CACHE_NONE } from './_lib/http.js';

export default readOnly(
  () => ({ status: 'ok', name: snapshot.service.name, version: snapshot.service.version }),
  CACHE_NONE
);
