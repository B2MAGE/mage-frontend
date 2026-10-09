# Engine package maintenance

The application uses the maintained source in
[B2MAGE/mage-engine](https://github.com/B2MAGE/mage-engine). Its upstream is
[arson-i-x/MAGE](https://github.com/arson-i-x/MAGE); the earlier `bsiscoe/MAGE`
address redirects there.

The initial source integration includes upstream main
`10d446b13d178815d4f3e33910b974f1ddb13404` (1.0.4), preserves the fork's ancestry,
and moves the platform's required 1.0.3 patch behavior into maintained source.
Current audio modes, rendering defaults and UI behavior remain unchanged by this
package migration. Compatibility removal is separate work in MAINT-02.

## Installed artifact

The release is `@b2mage/mage-engine` version `1.0.4-mage.1`. The frontend retains
the `@notrac/mage` dependency key as an import alias, pinned to the release's
`b2mage-mage-engine-1.0.4-mage.1.tgz` asset under the fork's
`v1.0.4-mage.1` tag. `package-lock.json` records the URL and content integrity.

[Release v1.0.4-mage.1](https://github.com/B2MAGE/mage-engine/releases/tag/v1.0.4-mage.1)
was built from merged fork commit `89d23d9663260945316880acc2edaae8b76c728b`.
A fresh dependency install and pack reproduced the tested archive byte-for-byte:
SHA256 `3a21e5c4f108a9188bfd38a5b6f53545b2694d2074736b53e7a1c71bfe132962`.
GitHub's uploaded asset digest and the consumer lockfile integrity match that
archive. Package release and this adoption do not record a production deployment.

The package contains the built engine, declarations, compiler-only entry,
compiled-output validation and audio/live-setting modules. `npm ci` installs
these files as released. There is no frontend `patch-package`, install-time
compiler extraction, or manual change to `node_modules`.

## Making a change

1. Fetch the fork and original repository. Integrate upstream main into the fork
   without discarding fork history, and review rendering/API changes.
2. Edit maintained engine source and its focused regression checks. Preserve the
   DOM-free compiler entry and output-validation boundaries.
3. Run the engine's tests, production build and package checks, then create an
   `npm pack` archive from that tested source. Compare supported scene outputs
   and check actual browser rendering, live settings, audio and disposal.
4. Merge the source changes into the fork, tag the tested revision and publish
   the built archive as a new GitHub release asset. Do not replace an existing
   version's archive. Publishing to the original npm namespace is unnecessary.
5. Update the frontend's alias URL and lockfile to that exact release. Verify a
   clean installation, the application and isolated-renderer builds, and the
   compiler-worker/renderer checks. The compiler bundle must retain dynamically
   invoked ShaderPark functions and must not acquire DOM/WebGL imports.
6. Coordinate application and isolated-renderer deployment. A source merge or
   package release does not demonstrate that production uses the new artifact.

The frontend retains consumer checks for compiled output, live settings,
external clocks/audio and isolated playback. Engine implementation tests belong
in the fork. New supported engine modules require an explicit review of the
renderer/compiler build allowlists; do not broaden them to all dependencies.

## Reverting an adoption

Revert the frontend package URL and matching lockfile together, rebuild both
application and isolated renderer, and redeploy the matching pair. Keep existing
release artifacts available. A rollback does not need a runtime compatibility
layer or an install-time patch.

## Historical documentation

Dated release records may describe the former `@notrac/mage@1.0.3` patch. Those
records remain evidence of their original deployments; they are not current
installation or package-maintenance instructions.
