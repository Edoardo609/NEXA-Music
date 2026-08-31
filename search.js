import { config } from "hatchable";

export const access = "public";

export default async function (req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  let key;
  try {
    key = await config.get('YOUTUBE_API_KEY');
  } catch (e) {
    return res.status(503).json({ error: 'YouTube search is not configured yet.' });
  }
  if (!key) return res.status(503).json({ error: 'YouTube search is not configured yet.' });
  const params = new URLSearchParams({
    part: 'snippet',
    q: q + ' -shorts',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: '12',
    key
  });
  const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + params.toString());
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'YouTube API error' });
  return res.json({ data: (data.items || []).map(v => ({
    id: 'yt-' + v.id.videoId,
    videoId: v.id.videoId,
    title: v.snippet?.title || 'YouTube video',
    artist: v.snippet?.channelTitle || 'YouTube',
    artwork: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
    source: 'YouTube',
    youtube: true,
    url: 'https://www.youtube.com/watch?v=' + v.id.videoId
  })) });
}