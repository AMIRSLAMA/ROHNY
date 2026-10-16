# ROHNY wallet ledger — first phase

Wallet balances are stored as integer minor units in the wallet's selected ISO 4217 currency. For example, EGP and USD normally use 2 fractional digits, while some currencies use 0 or 3. The API returns `minorUnitDigits` so clients can interpret `balanceMinor` and `amountMinor` correctly. Each currency has a separate wallet; balances in different currencies are not automatically converted.

The wallet is an internal accounting ledger, not a bank account and not proof of deposited funds.

## Endpoints

- GET `/wallet/me?currency=EGP` — the authenticated rider/driver's wallet balance. Currency defaults to EGP.
- GET `/wallet/transactions?limit=50&currency=EGP` — the authenticated user's entries in that currency (limit 1–100).
- POST `/wallet/transfers` — driver-only transfer to an active rider wallet in the same currency.

Transfer JSON example:

    {
      "recipientUserId": "customer-user-uuid",
      "amountMinor": 1250,
      "currency": "EGP",
      "idempotencyKey": "a-client-generated-uuid",
      "description": "Fare difference refund"
    }

Use the currency's minor-unit scale when supplying `amountMinor`. For example, `1250` means EGP 12.50, and USD 12.50 is also `1250`; currencies with zero fractional digits use whole units.

Transfers are atomic, require sufficient available balance, lock both accounts, and use an idempotency key to avoid duplicate debits on retries. Cross-currency transfers are rejected. The recipient must be an active customer account. No endpoint in this phase can mint wallet funds, withdraw cash, or mark a card payment as successful.

## Migration and rollout

Migration `1792200000000-SupportMultipleWalletCurrencies` removes the EGP-only constraints and makes wallets unique per user and currency. Existing EGP balances and transactions are preserved. The migration must be applied to each deployed database before the new API is started against it.

## Not enabled yet

Currency selection does not perform foreign-exchange conversion and does not make international payments available by itself. Real card collection, wallet top-ups, cash-outs, automated trip fare/commission settlement, FX rates/conversion, and payment-provider webhooks require trip lifecycle/pricing integration and supported providers. Do not enable production money movement until provider signatures, duplicate webhook handling, reconciliation, and applicable regulatory requirements are reviewed.
