// TURN credentials for playing together: when two networks won't let players connect directly (mobile data,
// carrier-grade NAT, strict office Wi-Fi), Cloudflare relays the game between them. The TURN key stays here on the
// server; browsers only ever see credentials that expire.
// shortcut: anyone can ask this for credentials; tag them with customIdentifier and watch usage if abuse shows up.
const TTL = 12 * 3600 // longer than any sitting, so a match never loses its relay halfway

export async function GET() {
  const id = process.env.TURN_KEY_ID, token = process.env.TURN_KEY_API_TOKEN
  const none = status => Response.json({ iceServers: [] }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!id || !token) return none(200) // not set up: players still connect directly when their networks allow it
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL }),
  }).catch(() => null)
  if (!r?.ok) return none(502)
  const { iceServers = [] } = await r.json()
  // browsers block port 53, and a URL on it only times out
  const ok = iceServers.map(s => ({ ...s, urls: [s.urls].flat().filter(u => !/:53\b/.test(u)) }))
  return Response.json({ iceServers: ok }, { headers: { 'Cache-Control': 'no-store' } })
}
