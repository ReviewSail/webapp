// Only preserve an internal inbox destination and a valid report identifier.
function issueQuery(search: string, separator: string) {
  const id = new URLSearchParams(search).get('issue') || '';
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? separator + 'issue=' + id : '';
}
export const inboxLoginPath = (pathname: string, search = '') => pathname === '/inbox' ? '/login?next=inbox'+issueQuery(search,'&') : '/login';
export const inboxSignInDestination = (search: string) => new URLSearchParams(search).get('next') === 'inbox' ? '/inbox'+issueQuery(search,'?') : '/dashboard';
