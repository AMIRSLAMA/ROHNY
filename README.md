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


## City-based fare pricing

- Admins configure each city in the admin dashboard using a unique city code, country code, local ISO 4217 currency, base fare, per-kilometer rate, per-minute rate, minimum fare, and ride-type multipliers.
- Riders choose an active city. The API calculates road distance and duration server-side using OSRM (default: `https://router.project-osrm.org`; set `ROHNY_ROUTING_URL` to a self-hosted or approved compatible OSRM endpoint).
- Fare formula: `max(minimumFare, (baseFare + distanceKm × perKilometer + durationMinutes × perMinute) × rideTypeMultiplier)`, rounded to two decimal places.
- `GET /pricing/cities` lists active city options; authenticated riders use `POST /pricing/quote`; admins use `GET /admin/pricing/cities` and `POST /admin/pricing/cities`.
- A trip stores the approved fare, currency, city code, server-calculated distance, and duration. Trip creation recalculates the route and rejects a changed quote so the rider must review it again.
- No city or price is seeded intentionally. An administrator must configure approved prices before booking is enabled for that city. The default public OSRM endpoint is suitable only for development/pilot use; production should use an approved routing service with capacity and service terms appropriate to the launch.
