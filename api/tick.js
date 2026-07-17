// Dispara o sync de leads de 2 em 2 minutos.
//
// Por que aqui e não no projeto "steio", onde o sync mora: aquele projeto está na conta
// olucaslal, que é plano Hobby — e Hobby só deixa rodar cron 1x por dia. Era por isso que
// o dashboard do SDR só enxergava lead novo às 11:00 e o time reclamava de lead sumido.
// Este projeto (steio-dashboard) está na launchesdot, que é Pro e aceita cron por minuto.
// Então o gatilho fica aqui e só chama o endpoint de lá, que continua sendo a fonte.
//
// O sync é idempotente (on_conflict=lead_key ignore-duplicates): rodar de 2 em 2 minutos
// não duplica nada e nunca sobrescreve o que o SDR já preencheu.

const SYNC = 'https://steio.vercel.app/api/dc-leads-sync';

export default async function handler(req, res) {
  const t0 = Date.now();
  try {
    const r = await fetch(SYNC, { headers: { 'x-tick': 'steio-dashboard' } });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 300) }; }
    return res.status(200).json({ ok: r.ok, ms: Date.now() - t0, upstream: j });
  } catch (e) {
    // não derruba o cron: só reporta. O próximo tick tenta de novo em 2 min.
    return res.status(200).json({ ok: false, ms: Date.now() - t0, erro: String(e).slice(0, 200) });
  }
}
