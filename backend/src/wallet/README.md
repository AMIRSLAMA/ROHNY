# ROHNY wallet ledger — first phase

Amounts are stored as integer piastres (amountMinor) in EGP. The user wallet is an internal accounting ledger, not a bank account and not proof of deposited funds.

## Endpoints

- GET /wallet/me — rider/driver wallet balance.
- GET /wallet/transactions?limit=50 — the authenticated user's own entries (1–100).
- POST /wallet/transfers — driver-only transfer to a rider wallet.

Transfer JSON example:

    {
      "recipientUserId": "customer-user-uuid",
      "amountMinor": 1250,
      "idempotencyKey": "a-client-generated-uuid",
      "description": "Fare difference refund"
    }

Transfers are atomic, require sufficient available balance, lock both accounts, and use an idempotency key to avoid duplicate debits on retries. The recipient must be an active customer account. No endpoint in this phase can mint wallet funds, withdraw cash, or mark a card payment as successful.

## Not enabled yet

Real card collection, wallet top-ups, cash-outs, automated trip fare/commission settlement, and payment-provider webhooks require the trip lifecycle/pricing integration and a merchant account with a supported provider. Do not enable production money movement until provider signatures, duplicate webhook handling, reconciliation, and the applicable Egyptian regulatory requirements are reviewed.
