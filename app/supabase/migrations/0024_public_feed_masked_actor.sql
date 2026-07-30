-- AfetHUB — migration 0024
-- The public feed names who did the thing — as "Köksal F.", never in full.
--
-- Two changes, and the second is the one that matters:
--
-- 1) mask_actor() turns a person's name into first name + surname initial. Names that
--    are not people ("Misafir", "Sistem", "Topluluk", …) pass through untouched.
--
-- 2) The browser stops receiving the full name at all. Until now the public feed read
--    `audit_log` directly under RLS, so every anonymous visitor's REST call returned
--    rows containing `actor` in full — "Köksal Fındık", "Elif Kaya" — and the only
--    reason nobody saw them is that the UI did not print them. That is exactly the
--    shape rules/05 §Public and Private Views rules out: private fields fetched and
--    hidden in the interface. Masking in React would have kept the leak and added a
--    label on top of it.
--
--    So: audit_log itself becomes admin-only, and everyone else reads audit_log_public
--    — a view that carries the masked actor and only the allow-listed actions. The
--    surname is not in the response to be un-hidden.
--
-- What this deliberately does NOT do: name people who did not choose to be named.
-- Community confirmations are recorded as "Misafir"/"Vatandaş" and stay that way —
-- confirming a report is not a public act (rules/08 keeps contributor identities out of
-- public display; a coordinator's operational decision is a different thing: it is the
-- act the feed exists to make accountable, and even that is shown masked).
--
-- Additive and idempotent.
-- =============================================================================

-- ---------- 1) The mask ------------------------------------------------------
-- "Köksal Fındık"     -> "Köksal F."
-- "Ayşe Nur Yılmaz"   -> "Ayşe Y."     (first word + last word's initial)
-- "Misafir"           -> "Misafir"     (single word: nothing to mask)
-- "AfetHUB Topluluğu" -> "AfetHUB Topluluğu"  (named below: not a person)
--
-- Turkish casing is done by hand: upper('i') is 'I' under most collations, and writing
-- "Ilhan" for İlhan is the kind of small disrespect that is worth four lines of SQL.
create or replace function mask_actor(p_actor text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v text := btrim(coalesce(p_actor, ''));
  parts text[];
  last text;
  ch text;
begin
  if v = '' then
    return '';
  end if;
  -- Institutional and placeholder actors: not personal names, nothing to protect.
  if v in ('Misafir', 'Ziyaretçi', 'Vatandaş', 'Topluluk', 'Sistem', 'Gönüllü',
           'Koordinatör', 'AfetHUB', 'AfetHUB Topluluğu', 'AfetHUB Koordinasyon Ekibi') then
    return v;
  end if;

  parts := regexp_split_to_array(v, '\s+');
  if array_length(parts, 1) < 2 then
    return v;
  end if;

  last := parts[array_length(parts, 1)];
  ch := substr(last, 1, 1);
  ch := case ch
          when 'i' then 'İ'
          when 'ı' then 'I'
          else upper(ch)
        end;
  return parts[1] || ' ' || ch || '.';
end $$;

-- ---------- 2) The public feed is a view, not the table ----------------------
-- No security_invoker: the view runs with its owner's rights, which is what lets it
-- serve visitors after the table below is closed. It therefore has to apply the row
-- filter itself — audit_is_public() is the same allow-list the policy used.
drop view if exists audit_log_public;
create view audit_log_public as
  select
    a.id,
    a.disaster_id,
    mask_actor(a.actor) as actor,
    a.action,
    a.detail,
    a.old_value,
    a.new_value,
    a.color,
    a.created_at
  from audit_log a
  where audit_is_public(a.action);

comment on view audit_log_public is
  'Public activity feed. Actor is masked to "First S." and only allow-listed actions appear.';

grant select on audit_log_public to anon, authenticated;

-- The raw table is now the admin system log and nothing else. A coordinator reads the
-- same feed a visitor does; the panel page that shows everything is admin-gated already.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_admin());
