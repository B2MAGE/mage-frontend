# Explore pagination (DISC-01)

Explore requests one bounded page of scene summaries from
`GET /api/scenes/discovery`. It keeps the existing cards, filters and sort choices.
The pagination component is shared with profile scene collections.

## URLs and requests

Browser URLs use one-based pages, for example:

```text
/scenes?tag=ambient&sort=most-viewed&page=2&size=12
```

The API uses zero-based pages. The example above requests
`/api/scenes/discovery?tag=ambient&sort=most-viewed&page=1&size=12`.
The response contains `items`, `page`, `size`, `totalElements` and `totalPages`.
Explore offers 12, 24 or 48 scenes per page, with 12 as the default.

- Changing a tag, sort or page size returns to page 1 while retaining the other
  URL choices. Refresh, shared links and Back/Forward use those same choices.
- Invalid URL page, size and sort values are replaced with supported values.
  An out-of-range page is replaced with the last available page and fetched again;
  an empty catalog resolves to page 1.
- The server sorts before paging. `most-liked` means the number of upvotes.
  `featured` and `recommended` retain their existing newest-first behavior;
  this story does not add a ranking algorithm.
- Superseded requests are aborted. A result also has to match the current request
  before it can update the page, even if cancellation was ignored by the transport.

## Scene summaries and previews

Explore summaries contain card metadata, thumbnails, engagement and playback
availability. They do not contain scene definitions, shader source or compiled
artifacts. The frontend summary normalizer also excludes executable fields.

A deliberate hover or keyboard focus can request one scene's existing detail
endpoint after the preview delay. The shared preview coordinator cancels pending
loads when intent ends, another preview takes over, or the card is removed. A
late response cannot start an abandoned preview. Reduced motion, touch-only input,
the animated-thumbnail preference, current playback permission and recovery
state continue to control whether a preview can run. Execution remains inside
the isolated renderer.

The additive discovery endpoint is used by Explore. Home, public profiles and
recommendation loading retain their current list contracts; this change does not
claim to paginate those surfaces. A scene's existing detail endpoint remains
responsible for deciding whether its playback data may be returned.

## Verification

Frontend tests cover URL normalization and navigation, page-size/filter resets,
first/final/out-of-range pages, deleted pages, empty/error/retry states, stale and
aborted requests, summary-only responses, and deliberate preview loading.
Profile tests cover reuse of the pagination controls. Backend integration tests
cover database paging, global sorting, tag filtering, counts and source omission.

For a local review, open `/scenes` at 390px and desktop widths. Check next/previous,
page size, tag and sort changes, refresh and Back/Forward. Open a shared URL with
an out-of-range page and confirm that it corrects itself. Cards should still open
their scene and creator links, and hovering should preserve the poster until the
authorized preview is ready.
