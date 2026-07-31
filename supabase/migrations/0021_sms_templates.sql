-- 0021_sms_templates.sql
--
-- SMS has never had a template of its own. The signup trigger creates only an
-- `email` row, and process-reviews selected templates with no type filter and
-- took templates[0] — so every text sent the email copy, complete with its three
-- appended URLs: 619 characters, five Twilio segments.
--
-- This seeds real SMS templates and makes the signup trigger create them too.
--
-- The SMS copy is deliberately GSM-7 clean and single-segment. An em-dash, a
-- curly apostrophe or an emoji would force UCS-2 encoding and cut a segment
-- from 160 characters to 70, so straight quotes and ASCII hyphens are load
-- bearing here, not a style preference.

-- Reminders get their own SMS copy: the invite wording reads oddly three days
-- later, and prefixing "[Reminder]" would burn 11 of 160 characters.
alter table public.message_templates drop constraint if exists message_templates_type_check;
alter table public.message_templates add constraint message_templates_type_check
  check (type = any (array['email', 'sms', 'sms_reminder']));

-- Backfill every location that has no SMS template.
insert into public.message_templates (location_id, type, template_text)
select l.id, 'sms',
       'Hi {firstName}, thanks for staying at {locationName}! How did we do? {reviewLink} Reply STOP to opt out'
from public.locations l
where not exists (
  select 1 from public.message_templates mt
  where mt.location_id = l.id and mt.type = 'sms'
);

insert into public.message_templates (location_id, type, template_text)
select l.id, 'sms_reminder',
       'Hi {firstName}, still keen to hear how your stay at {locationName} went: {reviewLink} Reply STOP to opt out'
from public.locations l
where not exists (
  select 1 from public.message_templates mt
  where mt.location_id = l.id and mt.type = 'sms_reminder'
);

-- New signups previously got an email template only.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_account_id uuid;
  new_location_id uuid;
begin
  insert into public.accounts (name)
  values (coalesce(new.raw_user_meta_data->>'full_name', 'My Account'))
  returning id into new_account_id;

  insert into public.users (id, account_id, role, email, full_name)
  values (
    new.id,
    new_account_id,
    'admin',
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Member')
  );

  insert into public.locations (account_id, name, timezone)
  values (new_account_id, 'Main Location', 'UTC')
  returning id into new_location_id;

  insert into public.message_templates (location_id, type, template_text)
  values
    (new_location_id, 'email',
     'Hi {firstName}, thanks for staying at {locationName}! If you have a moment, we''d love to hear how it went: {reviewLink}'),
    (new_location_id, 'sms',
     'Hi {firstName}, thanks for staying at {locationName}! How did we do? {reviewLink} Reply STOP to opt out'),
    (new_location_id, 'sms_reminder',
     'Hi {firstName}, still keen to hear how your stay at {locationName} went: {reviewLink} Reply STOP to opt out');

  return new;
end;
$function$;
