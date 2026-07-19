// api/enrich.js
// Visits each job detail page to extract:
// - Exact band number
// - Certificate of Sponsorship (yes/no)
// - Full working pattern
// Run by Vercel cron after fetch.js

const SUPABASE_URL = 'https://cjvywhempvquppksqeol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdnl3aGVtcHZxdXBwa3NxZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NzEwOTAsImV4cCI6MjEwMDA0NzA5MH0.Y_jmSqA9ZtVV1DH-CB--m067-GFPAZfDplMyRRJTFqw';

const HDRS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept':          'text/html',
  'Accept-Language': 'en-GB,en;q=0.9',
};

function clean(s) {
  return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}

function parseJobDetail(html) {
  const text = html.toLowerCase();

  // Band - look for "Band X" in detail page
  let band = undefined;
  const bandMatch = html.match(/(?:band|pay\s+band)[^>]*>?\s*Band\s+(\d+|[A-Za-z]+)/i)
                 || html.match(/Band\s+(\d+[a-z]?)/i);
  if (bandMatch) {
    const bStr = bandMatch[1].toLowerCase();
    const wordBands = {two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
    band = parseInt(bStr) || wordBands[bStr];
  }

  // Also try data-test attributes for band
  const bandDT = html.match(/<[^>]*data-test="[^"]*band[^"]*"[^>]*>([^<]+)</i);
  if (bandDT && !band) {
    const b = bandDT[1].match(/\d+/);
    if (b) band = parseInt(b[0]);
  }

  // Certificate of Sponsorship
  const hasSponsor =
    text.includes('certificate of sponsorship') ||
    text.includes('skilled worker sponsorship') ||
    text.includes('visa sponsorship') ||
    text.includes('sponsorship to work in the uk');

  // Working pattern - get from detail page (more reliable than search results)
  let workingPattern = '';
  const wpMatch = html.match(/Working\s+pattern[^<]*<[^>]+>([^<]+)</i);
  if (wpMatch) workingPattern = wpMatch[1].trim();

  // Full time check from detail
  const isFullTime = text.includes('full-time') || text.includes('full time');
  const isPartTime = text.includes('part-time') || text.includes('part time');

  // Permanent check
  const isPermanent = text.includes('permanent');
  const isFixedTerm = text.includes('fixed term') || text.includes('fixed-term');

  return { band, hasSponsor, workingPattern, isFullTime, isPartTime, isPermanent, isFixedTerm };
}

async function getUnenrichedJobs() {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/jobs?enriched=eq.false&select=id,url&limit=5000',
    {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      }
    }
  );
  if (!r.ok) return [];
  return r.json();
}

async function updateJob(id, data) {
  await fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ ...data, enriched: true }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const auth = req.headers.authorization;
  if (auth !== 'Bearer ' + process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const jobs = await getUnenrichedJobs();
  if (!jobs.length) return res.status(200).json({ ok: true, enriched: 0 });

  let enriched = 0, errors = 0;

  for (const job of jobs) {
    try {
      const r = await fetch(job.url, { headers: HDRS, signal: AbortSignal.timeout(10000) });
      if (!r.ok) { await updateJob(job.id, { enriched: true }); continue; }
      const html   = await r.text();
      const detail = parseJobDetail(html);
      await updateJob(job.id, detail);
      enriched++;
      // Small delay to avoid hammering NHS Jobs
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch {
      errors++;
      await updateJob(job.id, { enriched: true }); // mark as done to avoid retry loop
    }
  }

  return res.status(200).json({ ok: true, enriched, errors, remaining: jobs.length - enriched });
}
