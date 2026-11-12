// Gym11 cloud backups (Cloudflare Pages Functions + KV binding "BACKUPS").
//
// Profiles are identified only by "nombre + inicial del apellido" (no password):
// any new name creates its profile. Backups are append-only snapshots so nothing a client
// uploads can overwrite or delete an earlier copy.
//
// KV keys:
//   profile:<id>        -> {id, name, firstName, createdAt}
//   backup:<id>:<iso>   -> backup JSON (metadata: {at, sessions, bytes})
//   latest:<id>         -> {at, sessions, bytes} of the newest backup
//
// Syncing only reads `latest:<id>` (a cheap KV read). Listing keys is limited to
// 1,000 a day on the free plan, so it is only used to show the backup history.

const MAX_BYTES = 20 * 1024 * 1024; // KV values are limited to 25 MB.
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
const fail = (message, status = 400) => json({ error: message }, status);

// Profiles are "first name + surname initial" ("Alex F"). A full surname
// ("Alex Fernández") maps to the same profile.
export function normalizeName(raw) {
  const clean = String(raw ?? '').normalize('NFC').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length < 2) throw new Error('Escribe tu nombre y la inicial de tu apellido, por ejemplo «Alex F».');
  if (words[0].length > 30) throw new Error('El nombre es demasiado largo.');
  const slug = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const first = slug(words[0]), initial = slug(words[1]).charAt(0);
  if (!first || !initial) throw new Error('Usa solo letras en el nombre.');
  const cap = w => w.charAt(0).toLocaleUpperCase('es') + w.slice(1).toLocaleLowerCase('es');
  const firstName = cap(words[0]);
  return { id: `${first}-${initial}`, name: `${firstName} ${words[1].charAt(0).toLocaleUpperCase('es')}.`, firstName };
}

async function getProfile(env, id) {
  if (!ID_RE.test(id || '')) return null;
  return env.BACKUPS.get(`profile:${id}`, 'json');
}

async function listBackups(env, id) {
  const items = [];
  let cursor;
  do {
    const page = await env.BACKUPS.list({ prefix: `backup:${id}:`, cursor });
    for (const k of page.keys) items.push({ at: k.metadata?.at || k.name.split(':').slice(2).join(':'), sessions: k.metadata?.sessions ?? null, bytes: k.metadata?.bytes ?? null });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

// Newest backup's metadata from its pointer key; profiles saved before the pointer
// existed fall back to a single listing, which also creates the pointer.
async function latestBackup(env, id) {
  const meta = await env.BACKUPS.get(`latest:${id}`, 'json');
  if (meta) return meta;
  const newest = (await listBackups(env, id))[0] || null;
  if (newest) await env.BACKUPS.put(`latest:${id}`, JSON.stringify(newest));
  return newest;
}

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  let p;
  try { p = normalizeName(body.name); } catch (e) { return fail(e.message); }
  let profile = await getProfile(env, p.id);
  const created = !profile;
  if (!profile) {
    profile = { ...p, createdAt: new Date().toISOString() };
    await env.BACKUPS.put(`profile:${p.id}`, JSON.stringify(profile));
  }
  return json({ profile, created, latest: created ? null : await latestBackup(env, p.id) });
}

async function saveBackup(request, env, id) {
  if (!(await getProfile(env, id))) return fail('Perfil no encontrado.', 404);
  const text = await request.text();
  if (text.length > MAX_BYTES) return fail('La copia supera 20 MB.', 413);
  let data;
  try { data = JSON.parse(text); } catch { return fail('Copia no válida.'); }
  if (data?.format !== 'gym11-pwa' || data.version !== 1 || !Array.isArray(data.sessions) || !Array.isArray(data.exercises))
    return fail('Copia no válida.');
  const at = new Date().toISOString();
  const meta = { at, sessions: data.sessions.length, bytes: text.length };
  await env.BACKUPS.put(`backup:${id}:${at}`, text, { metadata: meta });
  await env.BACKUPS.put(`latest:${id}`, JSON.stringify(meta));
  return json(meta, 201);
}

async function loadBackup(env, id, at) {
  if (!(await getProfile(env, id))) return fail('Perfil no encontrado.', 404);
  if (!at) at = (await latestBackup(env, id))?.at;
  if (!at) return fail('Todavía no hay copias.', 404);
  const text = await env.BACKUPS.get(`backup:${id}:${at}`);
  if (!text) return fail('Copia no encontrada.', 404);
  return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequest({ request, env }) {
  if (!env.BACKUPS) return fail('El almacenamiento de copias no está configurado.', 503);
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'login' && parts.length === 1 && request.method === 'POST') return await login(request, env);
    if (parts[0] === 'profiles' && parts.length >= 3 && parts[2] === 'backups') {
      const id = decodeURIComponent(parts[1]);
      if (!ID_RE.test(id)) return fail('Perfil no válido.');
      if (parts.length === 3 && request.method === 'GET') {
        if (!(await getProfile(env, id))) return fail('Perfil no encontrado.', 404);
        return json({ backups: await listBackups(env, id) });
      }
      if (parts.length === 3 && request.method === 'POST') return await saveBackup(request, env, id);
      if (parts.length === 4 && parts[3] === 'head' && request.method === 'GET') {
        if (!(await getProfile(env, id))) return fail('Perfil no encontrado.', 404);
        return json({ latest: await latestBackup(env, id) });
      }
      if (parts.length === 4 && request.method === 'GET')
        return await loadBackup(env, id, parts[3] === 'latest' ? null : decodeURIComponent(parts[3]));
    }
    return fail('No encontrado.', 404);
  } catch (e) {
    return fail('Error del servidor: ' + (e?.message || e), 500);
  }
}
