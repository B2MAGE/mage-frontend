import { ScenePagination, type ScenePaginationProps } from '@shared/ui'
import { PROFILE_PAGE_SIZE_OPTIONS } from '../profileSceneList'

type ProfileScenesPaginationProps = Omit<ScenePaginationProps, 'label' | 'pageSizeOptions'>

export function ProfileScenesPagination(props: ProfileScenesPaginationProps) {
  return <ScenePagination {...props} label="Profile scene pagination" pageSizeOptions={PROFILE_PAGE_SIZE_OPTIONS} />
}
