export const access = "member";
export const methods = ["GET"];

export default async function (req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) return res.json({ data: [] });
  const search = encodeURIComponent(`(${q}) AND mediatype:audio AND collection:opensource_audio`);
  const r = await fetch(`https://archive.org/advancedsearch.php?q=${search}&fl[]=identifier&fl[]=title&fl[]=creator&rows=8&page=1&output=json`);
  if (!r.ok) return res.status(502).json({ error: 'Archive music service unavailable' });
  const body = await r.json();
  const docs = body?.response?.docs || [];
  const data = (await Promise.all(docs.map(async d => {
    try {
      const m = await fetch(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
      if (!m.ok) return null;
      const meta = await m.json();
      const files = Array.isArray(meta.files) ? meta.files : [];
      const audio = files.find(f => /\.(mp3|ogg|oga|flac)$/i.test(String(f.name || '')) && !String(f.name).includes('_spectrogram'));
      if (!audio) return null;
      return {
        id: `archive-${d.identifier}`,
        title: d.title || d.identifier,
        artist: Array.isArray(d.creator) ? d.creator[0] : (d.creator || 'Unknown artist'),
        album: 'Internet Archive',
        artwork: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
        duration: Number(audio.length || 0),
        streamUrl: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(audio.name)}`,
        source: 'Internet Archive / open-source audio'
      };
    } catch { return null; }
  }))).filter(Boolean);
  res.json({ data });
}