# Orion for Mac — runbook

## Install

On a new Mac, run `bash apps/mac/scripts/install.sh`. It downloads the latest build from GitHub Releases, checks that it was signed with the Orion certificate (it refuses anything else), puts it in `~/Applications`, and opens it.

## How updates work

Every push to `main` that touches `apps/mac` or the design system builds a new version (`1.0.<run number>`), signs it, and publishes a GitHub release tagged `mac-v1.0.<run number>` with `Orion.zip` and `appcast.xml`. The app checks `appcast.xml` at launch and every 6 hours, downloads in the background, and asks once to restart. Updates that are not signed with the Sparkle key are refused. Settings has "Check for Updates…" for an immediate check.

Builds are signed with the self-signed "Orion Self-Signed" certificate. The app carries the `disable-library-validation` entitlement (`apps/mac/AppBundle/Orion.entitlements`); without it macOS will not load Sparkle into a self-signed app.

## Publish an update by hand

    gh workflow run "Mac release"
    gh run list --workflow "Mac release" --limit 1
    gh release view --json tagName,assets

## Roll back

Sparkle only moves forward, so a rollback means publishing the older code with a higher number: re-run the workflow on the older commit.

    gh workflow run "Mac release" --ref <older-branch-or-tag>

(`--ref` needs a branch or tag; push one at the older commit first.) The new release gets a new, higher number and becomes the latest.

## Keys and where they live

GitHub secrets: `ORION_MAC_CERT_P12`, `ORION_MAC_CERT_PASSWORD`, `SPARKLE_ED_PRIVATE_KEY`. Copies of the certificate file, its password and the Sparkle private key belong in the owner's password manager. Losing the Sparkle key means no more updates until everyone reinstalls. Never commit these. The public values (`SUPublicEDKey` in Info.plist, the certificate fingerprint in `install.sh`) are safe in the repo.

## Local development

Point the app at a local server:

    defaults write com.orion.app OrionBaseURLOverride http://127.0.0.1:3000

Build and install a local copy with `apps/mac/scripts/build-app.sh`. Local builds are version 0, so Sparkle will offer the newest release; that is how a dev build becomes the real one.

## Email template

The sign-in email (6-digit code) is set online with the Supabase Management API. Put the owner's access token in `.context/supabase-token.txt`, run this, then delete the file:

    TEMPLATE="$(cat supabase/templates/magic-link.html)"
    curl -fsS -X PATCH "https://api.supabase.com/v1/projects/edpqfigqmtbqzaauhquc/config/auth" \
      -H "Authorization: Bearer $(cat .context/supabase-token.txt)" -H "Content-Type: application/json" \
      -d "$(jq -n --arg c "$TEMPLATE" '{mailer_subjects_magic_link: "Your Orion sign-in code", mailer_templates_magic_link_content: $c}')"

The response should contain `"mailer_subjects_magic_link":"Your Orion sign-in code"`.
