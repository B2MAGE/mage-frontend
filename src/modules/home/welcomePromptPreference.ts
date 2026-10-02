import { readStorageItem, removeStorageItem, writeStorageItem } from '@shared/lib'

export const HOME_CREATE_PROMPT_HIDDEN_STORAGE_KEY = 'mage.home.create-prompt.hidden'

export function isHomeCreatePromptHidden() {
  return readStorageItem(HOME_CREATE_PROMPT_HIDDEN_STORAGE_KEY) === 'true'
}

export function setHomeCreatePromptHidden(hidden: boolean) {
  if (hidden) {
    writeStorageItem(HOME_CREATE_PROMPT_HIDDEN_STORAGE_KEY, 'true')
    return
  }

  removeStorageItem(HOME_CREATE_PROMPT_HIDDEN_STORAGE_KEY)
}
