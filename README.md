# ROHNY | روحني

Multi-country ride-hailing platform for Android and iOS.

## Project principles

- ROHNY is an independent project and must not modify or depend on Hesbah Online or Hesbah Offer.
- Build Android and iOS apps from a shared mobile codebase where practical.
- Support multiple countries, cities, currencies, languages, pricing rules, and payment providers through configuration rather than country-specific forks.
- Keep passenger, captain, and administration experiences clearly separated.
- Protect authentication, location data, trip records, and payment-related data.

## Planned components

1. **Passenger app** — pickup and destination selection, fare estimate, ride requests, live trip tracking, payment options, and ratings.
2. **Captain app** — onboarding and document review, availability, trip offers, navigation, trip status, and earnings.
3. **Admin dashboard** — country/city configuration, pricing, users, captains, trips, support, and operational reports.
4. **Backend API** — authentication, trip lifecycle, dispatch, pricing, notifications, and integrations.
5. **Data layer** — relational storage with geospatial support, audit events, and country/city configuration.

## Proposed technology direction

- Mobile: Flutter (Android and iOS)
- Backend: Node.js with NestJS
- Database: PostgreSQL with PostGIS
- Live updates: WebSockets
- Admin web: React / Next.js

These choices are initial proposals and should be validated against hosting, mapping, payment, and launch-country requirements before production implementation.

## Delivery roadmap

1. Confirm repository and development environment.
2. Establish project structure, coding conventions, and environment configuration.
3. Build the first mobile UI prototype.
4. Implement authentication and country/city configuration.
5. Implement the core ride lifecycle and captain dispatch.
6. Add maps, live tracking, notifications, and payments.
7. Add the administration dashboard, security checks, and tests.
8. Pilot in a launch city, then enable additional countries after local operational and legal requirements are met.

## Development safety

- Never commit secrets, API keys, signing keys, private certificates, or production credentials.
- Keep development, staging, and production environments separate.
- Validate every stage before proceeding to the next.
- Do not copy files or credentials from unrelated projects.
