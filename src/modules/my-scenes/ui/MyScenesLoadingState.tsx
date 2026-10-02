import { LoadingRegion, Skeleton } from '@shared/ui'

const TABLE_HEADINGS = ['Scene', 'Status', 'Updated', 'Views', 'Comments', 'Like ratio']

export function MyScenesLoadingState() {
  return (
    <LoadingRegion
      as="main"
      className="page-stack my-scenes-page my-scenes-page--loading"
      label="Loading your scenes"
    >
      <header className="my-scenes-page__header">
        <div>
          <h1 className="my-scenes-panel__title">My scenes</h1>
          <p className="my-scenes-panel__lead">
            Manage the scenes you’re building and the work you’ve already published.
          </p>
        </div>
        <Skeleton className="my-scenes-loading__summary" shape="line" />
      </header>

      <div className="my-scenes-board__toolbar my-scenes-loading__toolbar" aria-hidden="true">
        <Skeleton className="my-scenes-loading__filter-slot" shape="block" />
        <span className="my-scenes-board__toolbar-divider" />
        <Skeleton className="my-scenes-loading__selection" shape="line" />
      </div>

      <section className="my-scenes-library-shell my-scenes-loading__library" aria-hidden="true">
        <div className="my-scenes-scroll">
          <table className="my-scenes-table my-scenes-loading__table">
            <thead>
              <tr>
                <th className="my-scenes-check-cell" scope="col">
                  <Skeleton className="my-scenes-loading__checkbox" shape="block" />
                </th>
                {TABLE_HEADINGS.map((heading, index) => (
                  <th
                    className={index >= 3 ? 'my-scenes-numeric' : undefined}
                    key={heading}
                    scope="col"
                  >
                    {heading}
                  </th>
                ))}
                <th className="my-scenes-action-cell" scope="col" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }, (_, index) => (
                <tr className="my-scenes-row my-scenes-loading__row" key={index}>
                  <td className="my-scenes-check-cell">
                    <Skeleton className="my-scenes-loading__checkbox" shape="block" />
                  </td>
                  <td>
                    <div className="my-scenes-row__primary">
                      <Skeleton className="my-scenes-loading__thumbnail" shape="block" />
                      <div className="my-scenes-row__copy my-scenes-loading__scene-copy">
                        <Skeleton className="my-scenes-loading__scene-name" shape="line" />
                        <Skeleton className="my-scenes-loading__description" shape="line" />
                      </div>
                    </div>
                  </td>
                  <td><Skeleton className="my-scenes-loading__status" shape="block" /></td>
                  <td><Skeleton className="my-scenes-loading__date" shape="line" /></td>
                  <td className="my-scenes-numeric"><Skeleton className="my-scenes-loading__metric" shape="line" /></td>
                  <td className="my-scenes-numeric"><Skeleton className="my-scenes-loading__metric" shape="line" /></td>
                  <td className="my-scenes-numeric"><Skeleton className="my-scenes-loading__ratio" shape="line" /></td>
                  <td className="my-scenes-action-cell"><Skeleton className="my-scenes-loading__edit" shape="block" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="my-scenes-pagination my-scenes-loading__pagination">
          <div className="my-scenes-loading__pagination-rows">
            <Skeleton className="my-scenes-loading__rows-label" shape="line" />
            <Skeleton className="my-scenes-loading__rows-select" shape="block" />
          </div>
          <Skeleton className="my-scenes-loading__range" shape="line" />
          <div className="my-scenes-pagination__controls">
            <Skeleton className="my-scenes-loading__page-control" shape="block" />
            <Skeleton className="my-scenes-loading__page-number" shape="block" />
            <Skeleton className="my-scenes-loading__page-control" shape="block" />
          </div>
        </div>
      </section>
    </LoadingRegion>
  )
}
