/**
 * "Switch account" for a service behind Identity-Aware Proxy.
 *
 * There is no app session to end: IAP owns the session in an HttpOnly `GCP_IAP_UID` cookie, so
 * clearing React state or deleting a local token would change nothing — the next request is
 * authenticated again by the same cookie.
 *
 * IAP does expose one control: a request carrying `gcp-iap-mode=CLEAR_LOGIN_COOKIE` clears that
 * cookie and bounces through Google's account chooser (`prompt=select_account`). Choosing a
 * different account signs in as that identity; choosing one without
 * `roles/iap.httpsResourceAccessor` gets Google's 403, which is exactly the gate test.
 *
 * Two things this is deliberately NOT:
 * - it is not "log out": the Google session itself is untouched, so picking the same account
 *   signs straight back in;
 * - it is not a backend feature: no endpoint, no cookie handling, nothing to keep in sync.
 */

export const CLEAR_LOGIN_COOKIE = 'gcp-iap-mode=CLEAR_LOGIN_COOKIE'

/**
 * True only in a build deployed behind IAP. Baked at build time (the Dockerfile and the deploy
 * workflow set it), so a local `web.serve` does not advertise a link that would do nothing.
 */
export const IAP_ENABLED = process.env.NEXT_PUBLIC_IAP_ENABLED === '1'

/**
 * The current page, plus the IAP parameter, so the user lands back where they were after the
 * account chooser. Existing query parameters are preserved.
 */
export function buildSwitchAccountHref(pathname: string, search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.set('gcp-iap-mode', 'CLEAR_LOGIN_COOKIE')
  const path = pathname && pathname !== '/' ? pathname : '/'
  return `${path}?${params.toString()}`
}
