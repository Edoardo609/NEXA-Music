import { db, storage } from 'hatchable';

export const access = 'user';
export const methods = ['GET'];

export default async function (req, res) {
  const userId = String(req.user.id);
  const { rows } = await db.query('SELECT profile_image_key FROM user_profiles WHERE user_id = $1', [userId]);
  const key = rows[0]?.profile_image_key;
  if (!key) return res.status(404).send('No profile image');
  const item = await storage.get(key);
  if (!item?.buffer) return res.status(404).send('Profile image unavailable');
  res.setHeader('Content-Type', item.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=0, no-cache');
  return res.send(item.buffer);
}