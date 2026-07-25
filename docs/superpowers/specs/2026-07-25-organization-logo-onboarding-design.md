# Organization Logo Onboarding

## Goal

Simplify onboarding so it asks for only an organization name and organization logo. Preserve the existing product-based application model by creating an initial product named `Untitled product` without exposing that field in the form.

## User experience

- Keep the current frameless, centered sign-in-style layout.
- Keep the Meld mark, display heading, supporting copy, and 432px content width.
- Show an Astryx `TextInput` for the organization name.
- Show an Astryx `FileInput` drop zone for one required logo.
- Accept PNG, JPEG, and WebP images up to 2 MB.
- Show field-level validation for a missing, unsupported, or oversized logo.
- Keep the 36px `Create workspace` primary button.
- After successful creation, redirect to the organization members screen as today.

## Persistence

- Add a nullable `logo_path` column to `public.organizations`.
- Add a public `organization-logos` Supabase Storage bucket restricted to supported image formats and a 2 MB file-size limit.
- Permit authenticated users to upload only within their own user-ID folder.
- Upload the validated logo to a unique path before creating the organization.
- Pass that path to the organization-creation database function and store it with the organization.
- Continue creating the first product transactionally, using `Untitled product`.
- If organization creation fails after upload, attempt to remove the orphaned logo.

The column remains nullable so existing organizations and test fixtures continue to work.

## Server flow

1. Validate the organization name and logo from `FormData`.
2. Authenticate the user.
3. Upload the logo to `organization-logos/<user-id>/<uuid>.<extension>`.
4. Create the organization and hidden initial product in the existing transaction.
5. Store the logo path on the organization record.
6. Redirect to the members screen.

Errors return to the form without exposing storage or database details. Upload failures are retryable.

## Testing

- Component test: organization name and logo fields render; the first-product field does not.
- Action tests: the hidden product name is used, logo validation works, upload failures are handled, and successful creation persists the logo path.
- SQL tests: organization creation stores the logo path while still creating the admin membership and initial product.
- End-to-end onboarding test: attach a small image, create the organization, and verify the existing redirect.
- Run Astryx checks, unit tests, typecheck, lint, and production build.
