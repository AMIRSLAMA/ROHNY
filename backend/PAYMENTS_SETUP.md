# ROHNY card payment configuration (test mode first)

This feature uses Paymob's Intention API. Do not enable live mode until webhook HMAC verification, wallet ledger posting, trip completion rules, and reconciliation have been tested end to end.

Add these values to the backend environment file (never commit real values):

```dotenv
PAYMOB_BASE_URL=https://accept.paymob.com
PAYMOB_SECRET_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_CARD_INTEGRATION_ID=
PAYMOB_HMAC_SECRET=
PAYMOB_REDIRECTION_URL=https://your-approved-rohny-return-url
PAYMOB_WEBHOOK_URL=https://your-public-or-approved-tunnel-url/api/payments/webhooks/paymob
```

- Use test credentials and the test card integration ID first.
- Keep `PAYMOB_SECRET_KEY` and `PAYMOB_HMAC_SECRET` server-side only.
- The checkout endpoint fails closed when required values are missing.
- Never store a card number, CVV, PIN, or raw payment credentials.
- Do not treat a browser redirect as proof of payment; use the verified HMAC callback.
- Wallet top-ups are credited only inside the database transaction after a verified successful callback.
- Trip-fare and captain-commission payments are recorded, but the trip completion and commission settlement flows must be integrated and tested before live rollout.
- Confirm the callback HMAC field order and checkout URL against the current Paymob dashboard/docs for this merchant account before production.

## API

Authenticated requests use `Authorization: Bearer <access-token>`.

`POST /api/payments/card/checkout` requires an `Idempotency-Key` header. Body examples:

Rider wallet:
```json
{"purpose":"rider_wallet_topup","amountMinor":10000,"currency":"EGP"}
```

Captain wallet:
```json
{"purpose":"driver_wallet_topup","amountMinor":10000,"currency":"EGP"}
```

Rider trip fare:
```json
{"purpose":"trip_fare","tripId":"<trip-uuid>","currency":"EGP"}
```

Captain commission:
```json
{"purpose":"driver_commission","tripId":"<completed-trip-uuid>","currency":"EGP"}
```

`GET /api/payments/mine` lists only the signed-in user's payments (admins can list all). The unauthenticated Paymob callback is at `POST /api/payments/webhooks/paymob` and requires a valid HMAC header.
