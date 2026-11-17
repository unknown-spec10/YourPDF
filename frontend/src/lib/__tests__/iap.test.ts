import { describe, expect, it } from 'vitest'

import { buildSwitchAccountHref, IAP_ENABLED } from '@/lib/iap'

describe('switch account link', () => {
  it('points the current page at IAP with the cookie-clear parameter', () => {
    expect(buildSwitchAccountHref('/compress/')).toBe('/compress/?gcp-iap-mode=CLEAR_LOGIN_COOKIE')
  })

  it('works from the root path', () => {
    expect(buildSwitchAccountHref('/')).toBe('/?gcp-iap-mode=CLEAR_LOGIN_COOKIE')
  })

  it('preserves existing query parameters', () => {
    expect(buildSwitchAccountHref('/tools/', '?q=merge')).toBe(
      '/tools/?q=merge&gcp-iap-mode=CLEAR_LOGIN_COOKIE',
    )
  })

  it('replaces the parameter instead of duplicating it', () => {
    const href = buildSwitchAccountHref('/split/', '?gcp-iap-mode=CLEAR_LOGIN_COOKIE')

    expect(href.match(/gcp-iap-mode/g)).toHaveLength(1)
  })

  it('is not advertised outside an IAP build', () => {
    // Next inlines this at build time; a local build must not offer a link that does nothing.
    expect(IAP_ENABLED).toBe(false)
  })
})
