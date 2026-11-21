import { describe, it, expect } from 'vitest';
import { readInboxPage, type InboxPage } from './inboxFeed';
const previous: InboxPage = {accountId:'account-a',version:'version-a',hasMore:false,rows:[]};
describe('inbox protocol',()=>{
  it('accepts an explicit empty page',()=>expect(readInboxPage(previous)).toEqual(previous));
  it('retains only an exactly matched unchanged page',()=>expect(readInboxPage({...previous,rows:null},previous)).toBe(previous));
  it('rejects unchanged data without a cached page',()=>expect(()=>readInboxPage({...previous,rows:null})).toThrow());
  it.each([null,{}, {...previous,hasMore:'yes'},{...previous,rows:[{}]},
    {...previous,rows:null,accountId:'other'},{...previous,rows:null,hasMore:true},
  ])('rejects a malformed or unmatched response %j',data=>{
    expect(()=>readInboxPage(data,previous)).toThrow();
  });
});
