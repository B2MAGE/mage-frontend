import { useCallback, useRef, useState } from 'react'
import type { PersonalTemplateSource, SceneDraftSnapshot } from './sceneDraftRecovery'

type Entry = { snapshot: SceneDraftSnapshot; label: string }
type History = { present: SceneDraftSnapshot; past: Entry[]; future: Entry[]; group: string | null }
const HISTORY_LIMIT = 50
const HISTORY_BYTES = 4 * 1024 * 1024

export function draftContentKey(snapshot: SceneDraftSnapshot) {
  return JSON.stringify([snapshot.name, snapshot.description, snapshot.sceneData, snapshot.sceneDataText, snapshot.selectedTagIds,
    snapshot.templateSourceId ?? null, snapshot.personalTemplateSource ?? null])
}

function bounded(entries: Entry[]) {
  const kept = entries.slice(-HISTORY_LIMIT)
  let bytes = kept.reduce((size, entry) => size + JSON.stringify(entry).length * 2, 0)
  while (kept.length > 1 && bytes > HISTORY_BYTES) bytes -= JSON.stringify(kept.shift()).length * 2
  return kept
}

/** One current draft; history holds only snapshots needed to reverse user commands. */
export function useSceneDraftHistory(initial: () => SceneDraftSnapshot) {
  const [baseline, setBaseline] = useState(initial)
  const [history, setHistory] = useState<History>(() => ({ present: baseline, past: [], future: [], group: null }))
  const current = useRef(history)
  const activeGroup = useRef<string | null>(null)
  const publish = useCallback((next: History) => {
    current.current = next
    setHistory(next)
  }, [])
  const readDraft = useCallback(() => current.current.present, [])
  const commit = useCallback((recipe: (draft: SceneDraftSnapshot) => SceneDraftSnapshot, label = 'Edit scene') => {
    const state = current.current
    const next = recipe(state.present)
    if (draftContentKey(next) === draftContentKey(state.present)) {
      if (next.selectedBuilderObjectId !== state.present.selectedBuilderObjectId) publish({ ...state, present: next })
      return
    }
    const group = activeGroup.current
    publish({ present: next,
      past: group && group === state.group ? state.past : bounded([...state.past, { snapshot: state.present, label }]),
      future: [], group })
  }, [publish])
  const selectObject = useCallback((id: string | null) => {
    activeGroup.current = null
    const state = current.current
    publish({ ...state, group: null, present: { ...state.present, selectedBuilderObjectId: id } })
  }, [publish])
  const undo = useCallback(() => {
    const state = current.current
    const entry = state.past.at(-1)
    if (!entry) return
    activeGroup.current = null
    publish({ present: entry.snapshot, past: state.past.slice(0, -1),
      future: bounded([...state.future, { snapshot: state.present, label: entry.label }]), group: null })
  }, [publish])
  const redo = useCallback(() => {
    const state = current.current
    const entry = state.future.at(-1)
    if (!entry) return
    activeGroup.current = null
    publish({ present: entry.snapshot, past: bounded([...state.past, { snapshot: state.present, label: entry.label }]),
      future: state.future.slice(0, -1), group: null })
  }, [publish])
  const beginEdit = useCallback((id: string) => { activeGroup.current = id }, [])
  const endEdit = useCallback(() => {
    activeGroup.current = null
    current.current = { ...current.current, group: null }
  }, [])
  const restore = useCallback((snapshot: SceneDraftSnapshot) => {
    endEdit()
    commit(() => snapshot, 'Restore draft')
  }, [commit, endEdit])
  const reset = useCallback(() => {
    endEdit()
    commit(() => baseline, 'Reset draft')
  }, [baseline, commit, endEdit])
  const initializeTags = useCallback((ids: number[]) => {
    // Tags arrive after the initial scene. Hydration is not a user edit.
    const withTags = (draft: SceneDraftSnapshot) => ({ ...draft, selectedTagIds: ids })
    setBaseline(previous => withTags(previous))
    const state = current.current
    publish({ ...state, present: withTags(state.present),
      past: state.past.map(entry => ({ ...entry, snapshot: withTags(entry.snapshot) })),
      future: state.future.map(entry => ({ ...entry, snapshot: withTags(entry.snapshot) })) })
  }, [publish])
  const setPersonalTemplateSource = useCallback((source: PersonalTemplateSource) => {
    const state = current.current
    // A library write updates editor provenance, not the scene's undo stack.
    publish({ ...state, present: { ...state.present, templateSourceId: null, personalTemplateSource: source } })
  }, [publish])
  return { draft: history.present, baseline, readDraft, commit, selectObject, undo, redo, reset, restore,
    beginEdit, endEdit, initializeTags, setPersonalTemplateSource, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    canReset: draftContentKey(history.present) !== draftContentKey(baseline),
    undoLabel: history.past.at(-1)?.label, redoLabel: history.future.at(-1)?.label }
}
