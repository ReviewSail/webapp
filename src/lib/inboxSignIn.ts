// A fixed allowlist, never an arbitrary user-controlled return URL.
export const inboxLoginPath = (pathname: string) => pathname === '/inbox' ? '/login?next=inbox' : '/login';
export const inboxSignInDestination = (search: string) => new URLSearchParams(search).get('next') === 'inbox' ? '/inbox' : '/dashboard';
