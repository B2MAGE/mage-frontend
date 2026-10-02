import { describe, expect, it } from 'vitest'
import { selectPopularHomeTags } from './selectors'

describe('selectPopularHomeTags', () => {
  it('ranks attached tags by scene count, then name and ID, without mutating the input', () => {
    const tags = [
      { tagId: 7, name: 'Warm light', sceneCount: 3 },
      { tagId: 6, name: 'Glass', sceneCount: 7 },
      { tagId: 9, name: 'After hours', sceneCount: 3 },
      { tagId: 2, name: 'After hours', sceneCount: 3 },
      { tagId: 4, name: 'Slow motion', sceneCount: 9 },
      { tagId: 3, name: 'Unused', sceneCount: 0 },
    ]
    const original = tags.map(tag => ({ ...tag }))

    expect(selectPopularHomeTags(tags).map(tag => tag.tagId)).toEqual([4, 6, 2, 9])
    expect(tags).toEqual(original)
  })

  it('ignores zero, negative, and non-finite counts without adding fallback tags', () => {
    expect(selectPopularHomeTags([
      { tagId: 1, name: 'Zero', sceneCount: 0 },
      { tagId: 2, name: 'Negative', sceneCount: -1 },
      { tagId: 3, name: 'Infinite', sceneCount: Infinity },
      { tagId: 4, name: 'Invalid', sceneCount: NaN },
      { tagId: 5, name: 'Real tag', sceneCount: 1 },
    ])).toEqual([{ tagId: 5, name: 'Real tag', sceneCount: 1 }])
    expect(selectPopularHomeTags([])).toEqual([])
  })
})
