import { mountLiveMusicCheck } from './musicCheck'

declare const __MAGE_PLAYER_CHECK_PARENT_ORIGIN__: string
declare const __MAGE_PLAYER_CHECK_RENDERER_URL__: string

mountLiveMusicCheck({
  parentOrigin: __MAGE_PLAYER_CHECK_PARENT_ORIGIN__,
  rendererUrl: __MAGE_PLAYER_CHECK_RENDERER_URL__,
})
