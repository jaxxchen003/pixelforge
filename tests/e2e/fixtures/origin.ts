/**
 * Absolute origin of the running E2E server.
 *
 * Playwright computes `baseURL` from `PORT` / `PLAYWRIGHT_BASE_URL`, but that
 * value is not exposed to test code, so specs that build absolute URLs or set
 * an `Origin` header have to derive it the same way the config does. Deriving
 * it here keeps `PORT` overrides working without also requiring
 * `PLAYWRIGHT_BASE_URL`.
 */
export function getE2EOrigin(): string {
  const configured = process.env.PLAYWRIGHT_BASE_URL;
  if (configured) return new URL(configured).origin;

  const port = Number(process.env.PORT ?? 3000);
  return `http://localhost:${port}`;
}
