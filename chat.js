export const access = "user";
export const methods = ["POST"];

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function webSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 300))}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NEXA-Music/1.0' } });
  if (!r.ok) return [];
  const html = await r.text();
  const results = [];
  const re = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 6) {
    const href = decodeHtml(m[1]);
    const title = decodeHtml(m[2]);
    const snippet = decodeHtml(m[3]);
    if (!title || !href) continue;
    const clean = href.startsWith('//') ? 'https:' + href : href;
    results.push({ title, url: clean, snippet });
  }
  return results;
}

export default async function (req, res) {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
    if (!messages.length) return res.status(400).json({ error: "Nessun messaggio." });
    const language = req.body?.language === "en" ? "English" : "Italiano";
    const memory = typeof req.body?.memory === "string" ? req.body.memory.slice(0, 3000) : "";
    const question = String(messages[messages.length - 1]?.content || '').trim();
    const currentTrack = req.body?.currentTrack && typeof req.body.currentTrack === 'object' ? req.body.currentTrack : null;

    let webResults = [];
    try { if (question) webResults = await webSearch(question); } catch (e) { console.warn('Web search failed', e); }
    const webContext = webResults.length
      ? `\n\nLIVE WEB SEARCH RESULTS (use these when relevant; they may be incomplete):\n${webResults.map((x, i) => `${i + 1}. ${x.title}\n${x.snippet || ''}\nURL: ${x.url}`).join('\n')}`
      : "\n\nNo live web search results were available for this request. Do not claim that you searched the web.";

    const system = language === "English"
      ? "You are NEXA AI, a knowledgeable general-purpose assistant built into NEXA Music. Answer the user's actual question directly and accurately. You can discuss artists, songs, history, science, technology, travel, news and everyday topics. When live web results are supplied, use them to improve accuracy, especially for current information, and mention the source URLs naturally when useful. Never invent details or pretend a source says something it does not. If sources conflict, say so. For named artists such as Alex Warren, identify them correctly and give useful factual context. Use current track and saved memory only when relevant. Keep answers natural and concise but useful."
      : "Sei NEXA AI, un assistente generale competente integrato in NEXA Music. Rispondi direttamente e con precisione alla domanda reale dell'utente. Puoi parlare di artisti, canzoni, storia, scienza, tecnologia, viaggi, notizie e argomenti quotidiani. Quando vengono forniti risultati di ricerca web in tempo reale, usali per aumentare la precisione, soprattutto per informazioni recenti, e cita naturalmente gli URL delle fonti quando utile. Non inventare dettagli e non fingere che una fonte dica qualcosa che non dice. Se le fonti sono in conflitto, segnalalo. Per artisti nominati come Alex Warren, riconoscili correttamente e dai un contesto informativo utile. Usa il brano corrente e la memoria salvata dell'utente solo quando sono pertinenti. Mantieni risposte naturali e concise ma utili.";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nexa-music.hatchable.site",
        "X-Title": "NEXA Music"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        messages: [{ role: "system", content: system + webContext + (memory ? `\n\nUser memory (use only to personalize naturally): ${memory}` : "") + (currentTrack ? `\n\nCurrent NEXA Music track: ${String(currentTrack.title||'')} — ${String(currentTrack.artist||'')}. Use this only when relevant.` : "") }, ...messages],
        max_tokens: 900,
        temperature: 0.45
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenRouter", response.status, data);
      return res.status(502).json({ error: "NEXA AI non è disponibile in questo momento. Riprova tra poco." });
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(502).json({ error: "NEXA AI non ha restituito una risposta." });
    return res.json({ text, user: req.member?.display_name ?? null, webSearched: webResults.length > 0, sources: webResults });
  } catch (error) {
    console.error("NEXA AI error", error);
    return res.status(502).json({ error: "Errore di connessione con NEXA AI." });
  }
}