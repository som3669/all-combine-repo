# SEO Inspector — License Backend (Cloudflare Worker)

Validates FastSpring license keys for the extension. Free tier is plenty.

## Deploy

```bash
npm i -g wrangler
wrangler login

# 1. Create KV namespace, paste the id into wrangler.toml
wrangler kv namespace create LICENSES

# 2. Set the FastSpring webhook HMAC secret
wrangler secret put FS_WEBHOOK_SECRET

# 3. Deploy
wrangler deploy
```

You'll get a URL like `https://seo-inspector-license.<you>.workers.dev`.

## Wire it up

**In FastSpring dashboard:**
- Products → create one-time product `seo-inspector-pro`, price $9.99
- Enable **License Keys** on the product (generated keys)
- Integrations → Webhooks → add `https://<your-worker>.workers.dev/webhook`
- Copy the webhook HMAC secret → that's `FS_WEBHOOK_SECRET`
- Note your storefront URL (e.g. `https://<store>.onfastspring.com/seo-inspector-pro`)

**In the extension** — edit `lib/paywall.js`:
```js
const STORE_URL    = "https://<store>.onfastspring.com/seo-inspector-pro";
const VALIDATE_URL = "https://<your-worker>.workers.dev/validate";
```

## Flow

1. User clicks **Upgrade** → FastSpring store opens
2. Buys → gets license key by email + webhook stores it (valid) in KV
3. User pastes key → **Activate** → extension calls `/validate` → unlocked
4. Refund/return → webhook flips key to invalid → extension re-checks daily

## Endpoints

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/validate` | `{ "key": "..." }` | `{ "valid": true/false, "message": "..." }` |
| POST | `/webhook` | FastSpring event (HMAC-signed) | `ok` |
