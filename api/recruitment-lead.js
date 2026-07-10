// /api/recruitment-lead.js
// Vercel serverless funkcija za obrazec MHC Recruitment
// Zahteva okoljsko spremenljivko: BREVO_API_KEY (Settings → Environment Variables)
// Neobvezno: BREVO_LIST_ID (številka Brevo liste, v katero se doda kontakt)

const BREVO_BASE = 'https://api.brevo.com/v3';
const NOTIFY_EMAIL = 'info@mhc-ai.eu';           // kam prejmeš obvestilo o novem povpraševanju
const SENDER = { name: 'MHC Recruitment', email: 'info@mhc-ai.eu' }; // mora biti verificiran pošiljatelj v Brevu

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('BREVO_API_KEY ni nastavljen v okoljskih spremenljivkah.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // --- 1. Preberi in validiraj podatke ---
  const b = req.body || {};
  const hotel   = String(b.hotel   || '').trim();
  const kraj    = String(b.kraj    || '').trim();
  const kontakt = String(b.kontakt || '').trim();
  const email   = String(b.email   || '').trim();
  const telefon = String(b.telefon || '').trim();
  const profili = Array.isArray(b.profili) ? b.profili.map(String) : [];
  const stevilo = String(b.stevilo_delavcev || '').trim();
  const zacetek = String(b.zacetek_dela || '').trim();
  const opombe  = String(b.opombe || '').trim();

  if (!hotel || !kontakt || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Manjkajoči ali neveljavni podatki' });
  }

  const brevoHeaders = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const profiliText = profili.length ? profili.join(', ') : '—';

  try {
    // --- 2. Ustvari / posodobi kontakt v Brevu ---
    const contactPayload = {
      email: email,
      updateEnabled: true,
      attributes: {
        IME_PRIIMEK: kontakt,
        PODJETJE: hotel,
        KRAJ: kraj,
        TELEFON: telefon,
        VIR: 'MHC Recruitment obrazec'
      }
    };
    if (process.env.BREVO_LIST_ID) {
      contactPayload.listIds = [Number(process.env.BREVO_LIST_ID)];
    }

    const contactRes = await fetch(`${BREVO_BASE}/contacts`, {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify(contactPayload)
    });
    // 400 "duplicate" ob updateEnabled ni kritična napaka — nadaljujemo
    if (!contactRes.ok && contactRes.status !== 400) {
      const t = await contactRes.text();
      console.error('Brevo contact error:', contactRes.status, t);
    }

    // --- 3. Obvestilo tebi (interni mail) ---
    const notifyHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#162040">
        <h2 style="color:#162040;border-bottom:2px solid #b49448;padding-bottom:8px">
          Novo povpraševanje — MHC Recruitment
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;font-weight:bold;width:200px">Hotel / podjetje:</td><td>${esc(hotel)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Kraj:</td><td>${esc(kraj)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Kontaktna oseba:</td><td>${esc(kontakt)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">E-naslov:</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Telefon:</td><td>${esc(telefon) || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Iskani profili:</td><td>${esc(profiliText)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Število delavcev:</td><td>${esc(stevilo)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Želeni začetek:</td><td>${esc(zacetek) || '—'}</td></tr>
        </table>
        <p style="margin-top:16px"><strong>Opombe:</strong><br>${esc(opombe) || '—'}</p>
      </div>`;

    const notifyRes = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: NOTIFY_EMAIL, name: 'MHC d.o.o.' }],
        replyTo: { email: email, name: kontakt },
        subject: `Novo povpraševanje: ${hotel} (${stevilo}× ${profiliText})`,
        htmlContent: notifyHtml
      })
    });
    if (!notifyRes.ok) {
      const t = await notifyRes.text();
      console.error('Brevo notify error:', notifyRes.status, t);
      throw new Error('Notify email failed');
    }

    // --- 4. Potrditveni mail stranki ---
    const confirmHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#162040">
        <div style="background:#162040;padding:24px;text-align:center">
          <span style="font-family:Georgia,serif;font-size:26px;color:#ffffff">MHC</span>
          <span style="font-size:11px;letter-spacing:3px;color:#cbb27a;font-weight:bold"> RECRUITMENT</span>
        </div>
        <div style="padding:24px">
          <p>Spoštovani ${esc(kontakt)},</p>
          <p>zahvaljujemo se vam za oddano povpraševanje po hotelskih kadrih za
          <strong>${esc(hotel)}</strong>.</p>
          <p>Vaše potrebe bomo skrbno pregledali in vas v najkrajšem možnem času
          kontaktirali s prvimi <strong>video-preverjenimi profili kandidatov</strong>,
          ki ustrezajo vašim kriterijem:</p>
          <ul style="font-size:14px">
            <li>Iskani profili: ${esc(profiliText)}</li>
            <li>Število delavcev: ${esc(stevilo)}</li>
            ${zacetek ? `<li>Želeni začetek dela: ${esc(zacetek)}</li>` : ''}
          </ul>
          <p>Za morebitna vprašanja smo dosegljivi na
          <a href="mailto:info@mhc-ai.eu" style="color:#b49448">info@mhc-ai.eu</a>.</p>
          <p>Lep pozdrav,<br><strong>Ekipa MHC Recruitment</strong><br>
          MHC d.o.o. — Mediterranean Hotels Consulting</p>
        </div>
        <div style="background:#faf9f5;padding:12px;text-align:center;font-size:11px;color:#5d6780">
          © MHC d.o.o. · To sporočilo ste prejeli, ker ste oddali povpraševanje na naši spletni strani.
        </div>
      </div>`;

    const confirmRes = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: email, name: kontakt }],
        subject: 'Vaše povpraševanje je prejeto — MHC Recruitment',
        htmlContent: confirmHtml
      })
    });
    if (!confirmRes.ok) {
      // potrditveni mail ni kritičen — povpraševanje je že pri tebi
      const t = await confirmRes.text();
      console.error('Brevo confirm error:', confirmRes.status, t);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('recruitment-lead error:', err);
    return res.status(500).json({ error: 'Sending failed' });
  }
}

// Preprosto HTML ubežanje za varno vstavljanje uporabniških podatkov v mail
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
