import { LoadingRegion, PagePanel, Skeleton } from '@shared/ui'

export function ModerationLoadingState() {
  return (
    <LoadingRegion
      as="main"
      className="ui-page-frame ui-page-frame--form moderation-area moderation-route-loading"
      label="Restoring your session before loading moderation"
    >
      <div className="moderation-route-loading__header">
        <Skeleton className="moderation-route-loading__eyebrow" shape="line" />
        <Skeleton className="moderation-route-loading__title" shape="line" />
        <Skeleton className="moderation-route-loading__lead" shape="line" />
      </div>
      <div className="moderation-layout">
        <div className="moderation-route-loading__nav">
          <Skeleton shape="line" />
          <Skeleton shape="line" />
          <Skeleton shape="line" />
        </div>
        <PagePanel className="moderation-loading-panel">
          <Skeleton className="moderation-loading-panel__title" shape="line" />
          <Skeleton className="moderation-loading-panel__copy" shape="line" />
          <Skeleton className="moderation-loading-panel__copy moderation-loading-panel__copy--short" shape="line" />
        </PagePanel>
      </div>
    </LoadingRegion>
  )
}
