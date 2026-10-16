# ROHNY backend readiness checklist

This checklist reflects a source review of the repository. Items marked "not implemented" are planned work, not claims that the product is production-ready.

## Present in the repository

- NestJS backend and a health endpoint at `GET /api/health`.
- PostgreSQL/TypeORM configuration with schema synchronization disabled.
- Versioned database migration files for users, trips, and wallet ledger.
- Email/phone registration input, email login, password hashing with Argon2, token guard, and authentication rate-limit guard.
- Rider trip creation/listing endpoints.
- Wallet balance, transaction history, and driver-to-rider wallet transfer code.
- GitHub Actions CI workflow that builds the backend, applies migrations to a disposable PostgreSQL service, verifies wallet schema, and runs unit tests.
- Environment-variable example; secrets should remain outside source control.

## Gaps to close before a real launch

### Highest priority
- [ ] Confirm the CI workflow is green on the latest commit and keep it required for merges where repository settings allow.
- [ ] Add automated tests for registration, login by email and phone, rate limiting, access control, trip creation, and wallet ledger/transfer edge cases.
- [ ] Verify migrations from an empty PostgreSQL database and document a repeatable migration/backup/restore procedure.
- [ ] Confirm the registration response and account-verification flow; phone/email verification timestamps exist, but a complete OTP delivery and verification workflow is not established by this review.
- [ ] Add production configuration validation and confirm JWT secrets, token expiry, HTTPS/reverse proxy, CORS, and rate limits are configured safely.

### Core ride-hailing product
- [ ] Country, city, supported language, currency, and per-city operating configuration.
- [ ] Driver onboarding, document review, driver availability, and dispatch/matching.
- [ ] Server-authoritative fare quotes and pricing rules; client-supplied distance/duration must not be treated as trusted billing facts.
- [ ] Complete trip state machine, cancellation rules, driver assignment, pickup, in-progress, completion, and dispute handling.
- [ ] Trusted location updates, live trip events, and location-data retention controls.
- [ ] Payment provider integration, reconciliation, refunds, and wallet ledger audit/reversal procedures.
- [ ] Admin authorization and audit logging for sensitive operational actions.
- [ ] Mobile passenger/captain apps and admin dashboard integrated with the API.
- [ ] Privacy, security, load, and end-to-end tests before a public launch.

## Safe next sequence

1. Verify CI and existing migrations/tests on the branch.
2. Add focused tests for authentication and authorization.
3. Verify all migrations against a disposable test database and document backup/restore.
4. Implement country/city configuration and server-side pricing.
5. Implement driver onboarding/dispatch and the full trip lifecycle.
6. Integrate mobile clients, maps, notifications, and payment providers.
7. Run a launch-readiness security and operational review.

Do not enable TypeORM `synchronize: true` as a shortcut in production. Use reviewed migrations instead.
