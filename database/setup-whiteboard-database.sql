------------------------------------------------------------
--  Tal's Whiteboard -- complete database setup
--
--  Creates a private "whiteboard" schema holding the board
--  settings and the submitted drawings, then exposes seven
--  narrow functions in "public" that the browser may call
--  anonymously through the Neon Data API.
--
--  Safe to run more than once.  Run it in the Neon SQL Editor,
--  then click "Refresh schema cache" on the Data API page.
------------------------------------------------------------


------------------------------------------------------------
--  Check that Managed Better Auth created the anonymous role
------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anonymous') then
    raise exception
      'The "anonymous" role does not exist. Enable the Data API with Managed Better Auth in the Neon console, then run this script again.';
  end if;
end;
$$;


------------------------------------------------------------
--  Private schema and tables
------------------------------------------------------------

create schema if not exists whiteboard;

-- Nothing outside the SECURITY DEFINER functions below may touch
-- this schema.  It is not the schema the Data API exposes, so the
-- tables are already unreachable; these revokes make that explicit.
revoke all on schema whiteboard from public;

create table if not exists whiteboard.board_settings (
  settings_row_id      integer     primary key default 1 check (settings_row_id = 1),
  submissions_are_open boolean     not null default false,
  gallery_generation   bigint      not null default 1,
  settings_updated_at  timestamptz not null default now()
);

insert into whiteboard.board_settings (settings_row_id)
values (1)
on conflict (settings_row_id) do nothing;

create table if not exists whiteboard.submissions (
  browser_submission_id uuid        not null,
  gallery_generation    bigint      not null,
  spokesperson_name     text        not null,
  full_png_base64       text        not null,
  thumbnail_png_base64  text        not null,
  first_submitted_at    timestamptz not null default now(),
  last_updated_at       timestamptz not null default now(),
  revision_number       integer     not null default 1,
  primary key (browser_submission_id, gallery_generation)
);

-- The gallery is ordered newest first by the time a browser first
-- submitted, so that replacing a drawing keeps its place.
create index if not exists submissions_ordered_newest_first
  on whiteboard.submissions (gallery_generation, first_submitted_at desc);

-- Belt and braces: even if these tables were ever exposed, there are
-- no policies, so no ordinary role could read or write them.  The
-- functions below run as the table owner and so are unaffected.
alter table whiteboard.board_settings enable row level security;
alter table whiteboard.submissions    enable row level security;


------------------------------------------------------------
--  Size limits, expressed in base64 characters
------------------------------------------------------------
--
--  Base64 turns every 3 bytes into 4 characters, so the character
--  ceiling for a byte ceiling N is ceil(N / 3) * 4.
--
--    full image  1 MiB   = 1048576 bytes -> 1398104 characters
--    thumbnail   100 KiB =  102400 bytes ->  136536 characters
--
--  Every PNG begins with the same eight signature bytes, which
--  base64 always encodes as the leading text 'iVBORw0KGgo'.
------------------------------------------------------------


------------------------------------------------------------
--  Read the current status
------------------------------------------------------------

create or replace function public.whiteboard_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_settings whiteboard.board_settings;
begin
  select * into the_settings
  from whiteboard.board_settings
  where settings_row_id = 1;

  return jsonb_build_object(
    'submissions_are_open', the_settings.submissions_are_open,
    'gallery_generation',   the_settings.gallery_generation,
    'submission_count',     (select count(*)
                             from whiteboard.submissions
                             where gallery_generation = the_settings.gallery_generation),
    'latest_change_at',     (select max(last_updated_at)
                             from whiteboard.submissions
                             where gallery_generation = the_settings.gallery_generation)
  );
end;
$$;


------------------------------------------------------------
--  Submit or replace one browser's drawing
------------------------------------------------------------

create or replace function public.whiteboard_submit(
  p_browser_submission_id uuid,
  p_spokesperson_name     text,
  p_full_png_base64       text,
  p_thumbnail_png_base64  text,
  p_gallery_generation    bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  the_settings  whiteboard.board_settings;
  trimmed_name  text;
  saved_row     whiteboard.submissions;
begin
  -- A share lock lets the roomful of students submit at the same time
  -- while making it impossible for a clear to slip in half way through.
  select * into the_settings
  from whiteboard.board_settings
  where settings_row_id = 1
  for share;

  if not the_settings.submissions_are_open then
    return jsonb_build_object(
      'result_status',      'submissions_closed',
      'gallery_generation', the_settings.gallery_generation
    );
  end if;

  -- The browser is working from a gallery that has since been cleared.
  -- Rejecting here is what stops an in-flight save from restoring it.
  if p_gallery_generation is distinct from the_settings.gallery_generation then
    return jsonb_build_object(
      'result_status',      'gallery_was_cleared',
      'gallery_generation', the_settings.gallery_generation
    );
  end if;

  trimmed_name := btrim(coalesce(p_spokesperson_name, ''));

  if length(trimmed_name) < 1 or length(trimmed_name) > 100 then
    raise exception 'The spokesperson name must be between 1 and 100 characters.'
      using errcode = 'check_violation';
  end if;

  if p_browser_submission_id is null then
    raise exception 'A browser submission identifier is required.'
      using errcode = 'not_null_violation';
  end if;

  if coalesce(length(p_full_png_base64), 0) = 0
     or length(p_full_png_base64) > 1398104 then
    raise exception 'The drawing must be a PNG of at most 1 MiB.'
      using errcode = 'check_violation';
  end if;

  if coalesce(length(p_thumbnail_png_base64), 0) = 0
     or length(p_thumbnail_png_base64) > 136536 then
    raise exception 'The thumbnail must be a PNG of at most 100 KiB.'
      using errcode = 'check_violation';
  end if;

  if left(p_full_png_base64, 11) <> 'iVBORw0KGgo'
     or left(p_thumbnail_png_base64, 11) <> 'iVBORw0KGgo' then
    raise exception 'Both images must be base64-encoded PNG data.'
      using errcode = 'check_violation';
  end if;

  insert into whiteboard.submissions as existing (
    browser_submission_id,
    gallery_generation,
    spokesperson_name,
    full_png_base64,
    thumbnail_png_base64
  )
  values (
    p_browser_submission_id,
    the_settings.gallery_generation,
    trimmed_name,
    p_full_png_base64,
    p_thumbnail_png_base64
  )
  on conflict (browser_submission_id, gallery_generation) do update
    set spokesperson_name    = excluded.spokesperson_name,
        full_png_base64      = excluded.full_png_base64,
        thumbnail_png_base64 = excluded.thumbnail_png_base64,
        last_updated_at      = now(),
        revision_number      = existing.revision_number + 1
  returning * into saved_row;

  return jsonb_build_object(
    'result_status',      'saved',
    'gallery_generation', saved_row.gallery_generation,
    'revision_number',    saved_row.revision_number,
    'first_submitted_at', saved_row.first_submitted_at,
    'last_updated_at',    saved_row.last_updated_at
  );
end;
$$;


------------------------------------------------------------
--  List the gallery without any image data
------------------------------------------------------------

create or replace function public.whiteboard_gallery_index()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_generation bigint;
begin
  select gallery_generation into the_generation
  from whiteboard.board_settings
  where settings_row_id = 1;

  return coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'browser_submission_id', browser_submission_id,
                'spokesperson_name',     spokesperson_name,
                'first_submitted_at',    first_submitted_at,
                'last_updated_at',       last_updated_at,
                'revision_number',       revision_number
              )
              order by first_submitted_at desc
            )
     from whiteboard.submissions
     where gallery_generation = the_generation),
    '[]'::jsonb
  );
end;
$$;


------------------------------------------------------------
--  Fetch only the thumbnails that have changed
------------------------------------------------------------

create or replace function public.whiteboard_thumbnails(
  p_browser_submission_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_generation bigint;
begin
  select gallery_generation into the_generation
  from whiteboard.board_settings
  where settings_row_id = 1;

  return coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'browser_submission_id', browser_submission_id,
                'thumbnail_png_base64',  thumbnail_png_base64,
                'last_updated_at',       last_updated_at
              )
            )
     from whiteboard.submissions
     where gallery_generation = the_generation
       and browser_submission_id = any (coalesce(p_browser_submission_ids, '{}'::uuid[]))),
    '[]'::jsonb
  );
end;
$$;


------------------------------------------------------------
--  Fetch one full-size drawing
------------------------------------------------------------

create or replace function public.whiteboard_full_image(
  p_browser_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_generation bigint;
  the_row        whiteboard.submissions;
begin
  select gallery_generation into the_generation
  from whiteboard.board_settings
  where settings_row_id = 1;

  select * into the_row
  from whiteboard.submissions
  where gallery_generation = the_generation
    and browser_submission_id = p_browser_submission_id;

  if not found then
    return jsonb_build_object('result_status', 'not_found');
  end if;

  return jsonb_build_object(
    'result_status',         'found',
    'browser_submission_id', the_row.browser_submission_id,
    'spokesperson_name',     the_row.spokesperson_name,
    'full_png_base64',       the_row.full_png_base64,
    'last_updated_at',       the_row.last_updated_at
  );
end;
$$;


------------------------------------------------------------
--  Open or close submissions
------------------------------------------------------------

create or replace function public.whiteboard_set_submissions_open(
  p_submissions_are_open boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  the_settings whiteboard.board_settings;
begin
  update whiteboard.board_settings
  set submissions_are_open = coalesce(p_submissions_are_open, false),
      settings_updated_at  = now()
  where settings_row_id = 1
  returning * into the_settings;

  return jsonb_build_object(
    'submissions_are_open', the_settings.submissions_are_open,
    'gallery_generation',   the_settings.gallery_generation
  );
end;
$$;


------------------------------------------------------------
--  Clear every drawing and start a new generation
------------------------------------------------------------

create or replace function public.whiteboard_clear_all()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  the_settings   whiteboard.board_settings;
  deleted_count  integer;
begin
  -- The exclusive lock makes this wait for any submission already in
  -- flight, so the count reported back is the true number deleted.
  select * into the_settings
  from whiteboard.board_settings
  where settings_row_id = 1
  for update;

  delete from whiteboard.submissions;
  get diagnostics deleted_count = row_count;

  -- Bumping the generation, rather than only deleting, is what makes a
  -- late-arriving save from before the clear identifiably stale.
  update whiteboard.board_settings
  set gallery_generation  = the_settings.gallery_generation + 1,
      settings_updated_at = now()
  where settings_row_id = 1
  returning * into the_settings;

  return jsonb_build_object(
    'deleted_count',        deleted_count,
    'gallery_generation',   the_settings.gallery_generation,
    'submissions_are_open', the_settings.submissions_are_open
  );
end;
$$;


------------------------------------------------------------
--  Grants: the seven functions and nothing else
------------------------------------------------------------

grant usage on schema public to anonymous, authenticated;

do $$
declare
  the_function text;
  app_functions text[] := array[
    'public.whiteboard_status()',
    'public.whiteboard_submit(uuid, text, text, text, bigint)',
    'public.whiteboard_gallery_index()',
    'public.whiteboard_thumbnails(uuid[])',
    'public.whiteboard_full_image(uuid)',
    'public.whiteboard_set_submissions_open(boolean)',
    'public.whiteboard_clear_all()'
  ];
begin
  foreach the_function in array app_functions loop
    execute format('revoke all on function %s from public', the_function);
    execute format('grant execute on function %s to anonymous, authenticated', the_function);
  end loop;
end;
$$;

------------------------------------------------------------
--  End of file
------------------------------------------------------------
