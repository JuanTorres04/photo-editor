-- Each user can keep at most 30 presets of their own (built-ins have no owner and aren't counted)
create function public.enforce_preset_quota()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.owner_id is not null
     and (select count(*) from public.presets where owner_id = new.owner_id) >= 30 then
    raise exception 'Preset limit reached (30). Delete a preset to save another.';
  end if;
  return new;
end;
$$;

create trigger presets_quota
  before insert on public.presets
  for each row execute function public.enforce_preset_quota();

-- Built-in looks, readable by everyone
insert into public.presets (owner_id, name, settings) values
  (null, 'Natural Pop',
   '{"contrast":10,"highlights":-8,"shadows":10,"vibrance":24,"saturation":4,"sharpen":25}'),
  (null, 'Golden Hour',
   '{"exposure":0.1,"temperature":30,"tint":6,"highlights":-22,"shadows":18,"vibrance":20,"vignette":-18,"curves":{"master":[[0,0],[0.25,0.2],[0.5,0.5],[0.75,0.8],[1,1]]}}'),
  (null, 'Moody Forest',
   '{"exposure":-0.25,"contrast":16,"highlights":-30,"shadows":14,"temperature":-10,"tint":-6,"vibrance":12,"saturation":-12,"vignette":-30,"grain":16,"curves":{"master":[[0,0],[0.25,0.2],[0.5,0.5],[0.75,0.8],[1,1]],"green":[[0,0],[0.5,0.52],[1,1]]}}'),
  (null, 'Cinematic Teal',
   '{"temperature":-12,"contrast":20,"highlights":-25,"shadows":10,"vibrance":16,"saturation":-6,"vignette":-20,"curves":{"red":[[0,0],[0.25,0.22],[0.75,0.8],[1,1]],"blue":[[0,0.04],[0.25,0.28],[0.75,0.72],[1,0.96]]}}'),
  (null, 'Soft Matte',
   '{"contrast":-12,"highlights":-10,"blacks":30,"saturation":-8,"curves":{"master":[[0,0.07],[1,0.96]]}}'),
  (null, 'Black and White',
   '{"contrast":22,"highlights":-12,"saturation":-100,"sharpen":20,"grain":18,"curves":{"master":[[0,0],[0.25,0.16],[0.5,0.5],[0.75,0.84],[1,1]]}}'),
  (null, 'Faded Film',
   '{"exposure":0.15,"contrast":-14,"temperature":10,"tint":4,"saturation":-14,"vignette":-12,"grain":28,"curves":{"master":[[0,0.08],[1,0.94]]}}'),
  (null, 'Punchy',
   '{"contrast":24,"highlights":-14,"shadows":14,"vibrance":34,"saturation":8,"sharpen":35,"curves":{"master":[[0,0],[0.25,0.2],[0.5,0.5],[0.75,0.8],[1,1]]}}');