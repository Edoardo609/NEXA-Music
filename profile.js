import { db, storage } from 'hatchable';
import crypto from 'node:crypto';

export const access = 'user';
export const methods = ['GET', 'PUT'];

export default async function (req, res) {
  const userId = String(req.user.id);

  if (req.method === 'GET') {
    const { rows } = await db.query(
      'SELECT first_name,last_name,display_name,birth_date,profile_image_key,language FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    const profile = rows[0] || { first_name:'', last_name:'', display_name:'', birth_date:null, profile_image_key:null, language:'it' };
    if (profile.profile_image_key) profile.profile_image_url = '/api/profile-image?v=' + Date.now();
    delete profile.profile_image_key;
    return res.json(profile);
  }

  const incomingFirst = String(req.body?.first_name || '').trim().slice(0, 80);
  const incomingLast = String(req.body?.last_name || '').trim().slice(0, 80);
  const incomingDisplay = String(req.body?.display_name || '').trim().slice(0, 80);
  const incomingBirth = req.body?.birth_date ? String(req.body.birth_date).slice(0, 10) : null;
  const incomingLanguage = ['it','en'].includes(String(req.body?.language)) ? String(req.body.language) : null;
  const existing = await db.query('SELECT first_name,last_name,display_name,birth_date,language,profile_image_key FROM user_profiles WHERE user_id = $1', [userId]);
  const prev = existing.rows[0] || {};
  const firstName = incomingFirst || String(prev.first_name || '').slice(0, 80);
  const lastName = incomingLast || String(prev.last_name || '').slice(0, 80);
  const displayName = incomingDisplay || String(prev.display_name || '').slice(0, 80);
  const birthDate = req.body && Object.prototype.hasOwnProperty.call(req.body, 'birth_date') ? incomingBirth : (prev.birth_date || null);
  const language = incomingLanguage || prev.language || 'it';
  if (!displayName) return res.status(400).json({ error: 'Completa prima il nome visualizzato.' });

  let imageKey = null;
  const imageData = typeof req.body?.profile_image_data === 'string' ? req.body.profile_image_data : '';
  if (imageData) {
    const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Profile image must be a valid image.' });
    const contentType = match[1].toLowerCase();
    const raw = match[2];
    const approxBytes = Math.floor(raw.length * 3 / 4);
    if (approxBytes > 5 * 1024 * 1024) return res.status(413).json({ error: 'Profile image max 5 MB.' });
    const buffer = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const ext = contentType.split('/')[1].replace(/[^a-z0-9]/g, '') || 'jpg';
    imageKey = `profiles/${userId}/${crypto.randomUUID()}.${ext}`;
    await storage.put(imageKey, buffer, contentType);
    const verified = await storage.get(imageKey);
    if (!verified?.buffer) return res.status(500).json({ error: 'Unable to verify uploaded profile image.' });
  }

  if (imageKey) {
    const old = await db.query('SELECT profile_image_key FROM user_profiles WHERE user_id = $1', [userId]);
    await db.query(`INSERT INTO user_profiles (user_id,first_name,last_name,display_name,birth_date,profile_image_key,language)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO UPDATE SET first_name=$2,last_name=$3,display_name=$4,birth_date=$5,profile_image_key=$6,language=$7,updated_at=now()`,
      [userId, firstName, lastName, displayName, birthDate, imageKey, language]);
    if (old.rows[0]?.profile_image_key && old.rows[0].profile_image_key !== imageKey) {
      try { await storage.del(old.rows[0].profile_image_key); } catch (e) { console.warn('Old profile image cleanup failed', e); }
    }
  } else {
    await db.query(`INSERT INTO user_profiles (user_id,first_name,last_name,display_name,birth_date,language)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET first_name=$2,last_name=$3,display_name=$4,birth_date=$5,language=$6,updated_at=now()`,
      [userId, firstName, lastName, displayName, birthDate, language]);
  }

  const { rows } = await db.query('SELECT profile_image_key FROM user_profiles WHERE user_id = $1', [userId]);
  const out = { ok: true, first_name:firstName, last_name:lastName, display_name:displayName, birth_date:birthDate, language };
  if (rows[0]?.profile_image_key) out.profile_image_url = '/api/profile-image?v=' + Date.now();
  return res.json(out);
}