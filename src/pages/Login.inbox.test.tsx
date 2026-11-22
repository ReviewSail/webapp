import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import { inboxLoginPath, inboxSignInDestination } from '../lib/inboxSignIn';
const mocks=vi.hoisted(()=>({signedIn:false}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({session:mocks.signedIn?{user:{id:'owner'}}:null,loading:false})}));
vi.mock('../context/ThemeContext',()=>({useTheme:()=>({resolved:'light'})}));
vi.mock('../integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@supabase/auth-ui-react',()=>({Auth:()=> <p>Isolated sign-in form</p>}));
afterEach(cleanup);
it('keeps inbox as the fixed destination through an expired session and sign-in',()=>{
  mocks.signedIn=false;
  const content=()=> <MemoryRouter initialEntries={[inboxLoginPath('/inbox')]}><Routes><Route path="/login" element={<Login />} /><Route path="/inbox" element={<p>Inbox destination</p>} /></Routes></MemoryRouter>;
  const view=render(content());expect(screen.getByText('Isolated sign-in form')).toBeInTheDocument();
  mocks.signedIn=true;view.rerender(content());expect(screen.getByText('Inbox destination')).toBeInTheDocument();
});
it('never redirects to arbitrary external or injected paths and keeps other login defaults',()=>{
  expect(inboxLoginPath('/settings')).toBe('/login');expect(inboxLoginPath('//evil.invalid')).toBe('/login');
  for(const search of ['', '?next=https://evil.invalid','?next=//evil.invalid','?next=/inbox','?next=javascript:alert(1)','?next=inbox%0a']) {
    expect(inboxSignInDestination(search)).toBe('/dashboard');
  }
  expect(inboxSignInDestination('?next=inbox')).toBe('/inbox');
});
