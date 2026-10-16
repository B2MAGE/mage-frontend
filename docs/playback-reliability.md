# PL-08 playback reliability

Tracking: [PL-08 #332](https://github.com/B2MAGE/mage-frontend/issues/332), under
[epic #288](https://github.com/B2MAGE/mage-frontend/issues/288). PL-04 #292 owns
page-wide scheduling; PL-06 #294 owns graphics startup and resource measurements.

## Milestone 1: operation failures and evidence

Capture, capability metadata, and optional audio observations have bounded,
request-local failure paths. Their timeout or unavailable result does not stop a
healthy renderer. A timed-out child capture remains single-flight until it settles
or its scene is retired. Malformed protocol envelopes, flooding, context loss and
the independent playback watchdog still retire the session.

Replacing a draft cancels pending work before permission checks or the latest-only
dispatch interval. The child aborts its obsolete load; stale callbacks and timers
cannot mark a newer generation failed. Capabilities are requested after readiness
and do not delay audio or first-frame completion.

Retry screens offer **Save playback report**. The report is kept only in page memory
(eight sessions, eighty operation events per session, latest progress/watchdog
sample). It contains fixed operation/phase/reason labels, generation/request IDs
and timings. It contains no scene source, media, account details, or URLs and is not
uploaded. Closing/reloading the page clears it.

Validation: 252 focused host, runtime, controller, player, recovery and diagnostic
tests passed; TypeScript passed. These are regression checks, not proof of the
original intermittent mobile timeout's cause. That cause remains unconfirmed.

New frontend cancellation commands require the matching renderer build. For a
future approved production release, deploy the renderer before its frontend.
No production deployment is included in this implementation task.
