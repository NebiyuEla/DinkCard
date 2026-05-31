# Dink Card Legal Review Notes

Last updated: May 31, 2026

## Wording Updated

- Updated platform and footer disclaimer wording in `src/lib/legal.js`.
- Updated support contact emails from the old `.cc` support address to official `dinkcard.et` addresses.
- Added explicit service-credit wording and no-P2P/no-cash-out/no-remittance positioning.
- Updated public contact page content to show `info@dinkcard.et`, `support@dinkcard.et`, and `security@dinkcard.et`.

## Risky Terms Reduced

- User-to-user send money is hidden from dashboard quick actions and the service balance page.
- User-to-user transfer API endpoints now return a blocked service-credit-only message.
- SEO private/auth pages now use `noindex, follow` so Google should focus on the public homepage and public content pages.

## New Restrictions Added

- Account credit is positioned as service credit only.
- P2P transfers, user-to-user balance transfers, cash-out, resale, crypto exchange, money exchange, and remittance activity are not supported.
- Registration now requires a valid phone number, first name, last name, matching password confirmation, accepted terms, and basic name/email validation.

## Admin Status And Logs

- New user registration writes an audit log and notifies admins.
- New KYC submissions notify admins.
- New support tickets/replies notify admins.
- New Chapa checkout and crypto funding address requests notify admins.
- Superadmin can reset a user's two-factor authentication with an audit reason.
- Admin user, KYC, support ticket, and audit log tables now expose IDs and improve long-text wrapping.

## SEO Updates

- `robots.txt` blocks private/auth/account routes from crawling.
- `sitemap.xml` keeps public pages only.
- Runtime SEO injection now respects per-route robots metadata.

## Remaining Owner/Legal Review

- Have a local legal/accounting advisor review whether all customer-facing service-credit wording matches the registered business license.
- Review whether any remaining UI labels such as "Add Money" should be renamed to "Add Service Credit" everywhere.
- Confirm refund, tax receipt, and customer complaint retention requirements for Ethiopia.
