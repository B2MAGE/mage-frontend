import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/** JSDOM does not implement native dialog opening/focus. Browser checks cover the top layer. */
export function mockNativeDialogs() {
  const methods = ['show', 'showModal', 'close'] as const
  const descriptors = methods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name))
  beforeEach(() => {
    for (const name of methods) Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = name !== 'close'
      },
    })
  })
  afterEach(() => {
    cleanup()
    methods.forEach((name, index) => {
      if (descriptors[index]) Object.defineProperty(HTMLDialogElement.prototype, name, descriptors[index]!)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
    })
  })
}
