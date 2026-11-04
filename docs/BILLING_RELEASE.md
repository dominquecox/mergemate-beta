# Billing release configuration

Production billing runs only when `STRIPE_MODE` is `live` and all four production values are present:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`

Set those values in the production Worker environment through the owner-operated secret workflow. Never commit their values or copy development values into production. The API requires an `sk_live_` key in live mode and rejects Stripe responses or webhook events whose `livemode` does not match the configured environment. Development and tests remain pinned to test mode and require an `sk_test_` key.

Before a production release, the owner verifies that the production webhook endpoint subscribes only to the event types handled in `apps/api/src/lib/stripe-events.ts`, that the two price names point to the intended live recurring prices, and that the production event queue is bound. Deployment remains a separate owner-approved action.
