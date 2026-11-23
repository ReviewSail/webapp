-- Run on a disposable rehearsal database after the pilot migration.
\set ON_ERROR_STOP on
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Failed: %',label; end if; end $$;
select gen_random_uuid() as owner,gen_random_uuid() as staff,gen_random_uuid() as stranger,
 gen_random_uuid() as receipt,gen_random_uuid() as attempt \gset
insert into auth.users(id,email,email_confirmed_at) values
 (:'owner','pilot-owner@example.invalid',now()),(:'staff','pilot-staff@example.invalid',now()),(:'stranger','another@example.invalid',now());
select account_id as account from public.users where id=:'owner' \gset
select id as loc from public.locations where account_id=:'account' \gset
update public.accounts set subscription_status='trialing' where id=:'account';
update public.users set role='staff',account_id=:'account' where id=:'staff';
update public.locations set timezone='UTC',midstay_enabled=true,enable_email=true where id=:'loc';
select current_date::text as arrival,(current_date+2)::text as departure \gset
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner',true);
select public.set_owner_alert_preference_v1(true,:'account');
select pg_temp.expect(public.import_guest_batch(:'loc',jsonb_build_array(jsonb_build_object('firstName','Test','lastName','Guest',
 'email','guest@example.invalid','source','direct','checkoutDate',:'departure','checkinDate',:'arrival','expectedArrival','15:30')))->0->>'status'='imported','CSV arrival time');
reset role;
select id as stay from public.orders where location_id=:'loc' \gset
select id as request from public.review_requests where order_id=:'stay' \gset
set local role service_role;
select pg_temp.expect(public.message_send_is_due(:'stay','arrival',current_date+time '17:30',false),'expected arrival before property default');
select pg_temp.expect(not public.message_send_is_due(:'stay','arrival',current_date+time '17:29',false),'early check-in held');
select pg_temp.expect(public.message_send_is_due(:'stay','midstay',(current_date+1)+time '12:00',false),'day two at noon');
reset role;
insert into public.message_send_attempts(order_id,request_id,phase,channel,claim_token)
 values (:'stay',:'request','arrival','email',:'attempt');
select pg_temp.expect(not exists(select 1 from public.select_due_guest_messages('arrival',true,true,50,current_date+time '17:30') q
 where q.order_id=:'stay'),'claimed check-in excluded across channels');
update public.orders set expected_arrival='17:20' where id=:'stay';
select pg_temp.expect(public.message_send_is_due(:'stay','arrival',(current_date+1)+time '09:00',false)
 and not public.message_send_is_due(:'stay','arrival',current_date+time '19:20',false),'hourly run rolls into quiet hours');
update public.orders set expected_arrival='23:00' where id=:'stay';
select pg_temp.expect(public.message_send_is_due(:'stay','arrival',(current_date+1)+time '09:00',false)
 and not public.message_send_is_due(:'stay','midstay',(current_date+1)+time '12:00',false),'merge late check-ins');
update public.orders set checkout_date=current_date+1 where id=:'stay';
select pg_temp.expect(not public.message_send_is_due(:'stay','arrival',(current_date+1)+time '09:00',false),'never on departure');
set local role anon;
select pg_temp.expect(public.report_stay_issue('request',:'request',:'receipt','Broken lock',null)->>'status'='accepted','guest submits');
select pg_temp.expect(public.report_stay_issue('request',:'request',:'receipt','Broken lock',null)->>'status'='duplicate','retry uses same receipt');
reset role;
select feedback_id as issue from private.stay_issues \gset
select pg_temp.expect((select count(*)=1 from owner_alert_api.jobs where feedback_id=:'issue'),'one owner alert');
select pg_temp.expect((select status='pending' from public.review_requests where id=:'request'),'review invite independent');
update public.orders set checkout_date=current_date+2,expected_arrival=null where id=:'stay';
select pg_temp.expect(not public.message_send_is_due(:'stay','arrival',current_date+time '18:00',false)
 and not public.message_send_is_due(:'stay','midstay',(current_date+1)+time '12:00',false),'linked report stops check-ins');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'staff',true);
select pg_temp.expect((select status='New' and contact='guest@example.invalid' from public.stay_issue_inbox(null,:'issue',null,0)),'staff reads new issue');
select pg_temp.expect(public.set_stay_issue_status(:'issue','In progress') and public.set_stay_issue_status(:'issue','Resolved'),'staff workflow');
select set_config('request.jwt.claim.sub',:'stranger',true);
select pg_temp.expect(not exists(select 1 from public.stay_issue_inbox(null,:'issue',null,0))
 and not public.set_stay_issue_status(:'issue','New'),'other account excluded');
reset role;
set local role anon;
select pg_temp.expect(public.report_stay_issue('property',:'loc',gen_random_uuid(),'Heater',null)->>'status'='invalid','shared QR requires contact');
select pg_temp.expect(public.report_stay_issue('property',:'loc',gen_random_uuid(),'Heater','visitor@example.invalid')->>'status'='accepted','shared QR intake');
rollback;
