export type AuthRoute = 'sign-in' | 'register' | 'forgot-password' | 'reset-password' | 'change-password' | 'invite-signup' | 'demo'

// Supabase's email links (invite, magic link, recovery) hand the session over
// as a second hash fragment, producing a malformed URL such as
// #/invite-signup#access_token=... Reading past the first fragment would weld
// the route to the token and the route would no longer match anything, so
// everything below reads only the leading fragment.
export function getCleanHash(): string {
  const hash = window.location.hash
  const secondHash = hash.indexOf('#', 1)
  return secondHash === -1 ? hash : hash.slice(0, secondHash)
}

export function getHashRoute(): string {
  return getCleanHash().replace('#/', '').replace('#', '').split('?')[0]
}

// Account routes such as sign-in and password recovery are handled before workspace routes.
// Returning null here lets App continue to the normal public-page or signed-in-workspace checks.
export function getAuthRoute(): AuthRoute | null {
  const route = getHashRoute()
  if (route === 'contact' || route === 'contact-sales' || route === 'request-demo') {
    return 'demo'
  }
  if (route === 'sign-in' || route === 'register' || route === 'forgot-password' || route === 'reset-password' || route === 'change-password' || route === 'invite-signup' || route === 'demo') {
    return route
  }
  // Email links enter on a query parameter so the URL fragment stays free for
  // Supabase's session token. The hash wins whenever it is set, so the user can
  // navigate away normally and the query cannot pin them to the auth screen.
  const query = new URLSearchParams(window.location.search)
  if (query.get('invite')) return 'invite-signup'
  if (query.get('reset')) return 'reset-password'
  return null
}

// Email links enter the app on a query parameter so the URL fragment stays free
// for Supabase's session token. Once the session exists we move the route into
// the fragment and drop the query, otherwise it keeps winning over the hash and
// the user cannot leave the auth screen.
export function pinAuthRouteToHash(route: AuthRoute) {
  if (!window.location.search) return
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = `#/${route}`
  window.history.replaceState(null, '', `${url.pathname}${url.hash}`)
}