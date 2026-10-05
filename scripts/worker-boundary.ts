export const BOUNDARY_PROBES = ['fetch', 'xhr', 'import-script', 'indexed-db', 'cache-storage'] as const
export const NETWORK_PROBES = ['fetch', 'xhr', 'import-script'] as const
export type BoundaryProbe = typeof BOUNDARY_PROBES[number]
export type NetworkProbe = typeof NETWORK_PROBES[number]
export type BoundaryOutcome = 'pending' | 'denied' | 'allowed' | 'unavailable' | 'not-exposed'
export type BoundaryEvidence = { valid: boolean; observationTimer: boolean;
  probes: Record<BoundaryProbe, { attempted: boolean; returned: boolean; outcome: BoundaryOutcome }> }
export type BoundaryMarker = { probe: BoundaryProbe | 'observation'; outcome: 'attempted' | 'returned' | 'denied' | 'allowed' | 'unavailable' | 'not-exposed' | 'timer' }
export type BoundaryEventValue = `${BoundaryMarker['probe']}:${BoundaryMarker['outcome']}`
export type WorkerCanaryCounts = { requests: number; kinds: Record<NetworkProbe, number> }
export type WorkerBoundarySummary = { started: boolean; compiled: boolean; terminated: boolean;
  production: BoundaryEvidence; policy: BoundaryEvidence; policyObservationMs: number }

const noncePattern = /^[a-f0-9]{32}$/
const owns = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'))
}
export function workerCanaryBase(scope: 'local' | 'production') {
  if (scope === 'local') return 'http://127.0.0.1:5178/__isolated-security/'
  if (scope === 'production') return 'https://mage.peterbucci.com/player-check/__isolated-security/'
  throw new Error('Unknown worker verification scope.')
}
export function workerCanaryUrl(scope: 'local' | 'production', nonce: string, kind: NetworkProbe) {
  if (!noncePattern.test(nonce) || !NETWORK_PROBES.includes(kind)) throw new Error('Invalid fixed worker canary.')
  return `${workerCanaryBase(scope)}canary?nonce=${nonce}&kind=${kind}`
}
export function emptyBoundaryEvidence(): BoundaryEvidence {
  return { valid: true, observationTimer: false, probes: Object.fromEntries(BOUNDARY_PROBES.map(probe =>
    [probe, { attempted: false, returned: false, outcome: 'pending' }])) as BoundaryEvidence['probes'] }
}
export function isBoundaryEvidence(value: unknown): value is BoundaryEvidence {
  return owns(value, ['valid', 'observationTimer', 'probes']) && typeof value.valid === 'boolean'
    && typeof value.observationTimer === 'boolean' && owns(value.probes, BOUNDARY_PROBES)
    && BOUNDARY_PROBES.every(probe => {
      const result = (value.probes as Record<string, unknown>)[probe]
      return owns(result, ['attempted', 'returned', 'outcome']) && typeof result.attempted === 'boolean'
        && typeof result.returned === 'boolean' && ['pending', 'denied', 'allowed', 'unavailable', ...(probe === 'cache-storage' ? ['not-exposed'] : [])].includes(result.outcome as string)
    })
}
export function isBoundarySummary(value: unknown): value is WorkerBoundarySummary {
  return owns(value, ['started', 'compiled', 'terminated', 'production', 'policy', 'policyObservationMs'])
    && ['started', 'compiled', 'terminated'].every(key => typeof value[key] === 'boolean')
    && isBoundaryEvidence(value.production) && isBoundaryEvidence(value.policy)
    && typeof value.policyObservationMs === 'number' && Number.isFinite(value.policyObservationMs)
    && value.policyObservationMs >= 0 && value.policyObservationMs <= 60000
}
export function readBoundaryMarker(value: unknown, nonce: string): BoundaryMarker | null {
  if (!noncePattern.test(nonce) || !owns(value, ['type', 'nonce', 'probe', 'outcome'])
    || value.type !== 'mage-worker-boundary-marker' || value.nonce !== nonce) return null
  if (value.probe === 'observation' && value.outcome === 'timer') return { probe: 'observation', outcome: 'timer' }
  return BOUNDARY_PROBES.includes(value.probe as BoundaryProbe)
    && ['attempted', 'returned', 'denied', 'allowed', 'unavailable', ...(value.probe === 'cache-storage' ? ['not-exposed'] : [])].includes(value.outcome as string)
    ? { probe: value.probe as BoundaryProbe, outcome: value.outcome as BoundaryMarker['outcome'] } : null
}
export function boundaryEventValue(marker: BoundaryMarker): BoundaryEventValue { return `${marker.probe}:${marker.outcome}` }
export function isBoundaryEventValue(value: unknown): value is BoundaryEventValue {
  if (value === 'observation:timer') return true
  return typeof value === 'string' && BOUNDARY_PROBES.some(probe =>
    ['attempted', 'returned', 'denied', 'allowed', 'unavailable', ...(probe === 'cache-storage' ? ['not-exposed'] : [])].some(outcome => value === `${probe}:${outcome}`))
}
export function recordBoundaryMarker(evidence: BoundaryEvidence, marker: BoundaryMarker) {
  if (marker.probe === 'observation') {
    if (evidence.observationTimer) evidence.valid = false
    evidence.observationTimer = true
    return
  }
  const result = evidence.probes[marker.probe]
  if (marker.outcome === 'attempted') {
    if (result.attempted) evidence.valid = false
    result.attempted = true
  } else if (!result.attempted) evidence.valid = false
  else if (marker.outcome === 'returned') {
    if (result.returned || result.outcome === 'not-exposed') evidence.valid = false
    result.returned = true
  } else if (['denied', 'allowed', 'unavailable', 'not-exposed'].includes(marker.outcome)) {
    if (result.outcome !== 'pending' || (marker.outcome === 'not-exposed' && (marker.probe !== 'cache-storage' || result.returned))) evidence.valid = false
    result.outcome = marker.outcome as BoundaryOutcome
  } else evidence.valid = false
}

/** Fixed API attempts only. Fresh sentinel names never enumerate or read existing storage. */
export function boundaryProbeSource(scope: 'local' | 'production', nonce: string, observe = false) {
  if (!noncePattern.test(nonce)) throw new Error('Invalid worker boundary nonce.')
  const urls = Object.fromEntries(NETWORK_PROBES.map(kind => [kind, workerCanaryUrl(scope, nonce, kind)]))
  const sentinel = `mage-fixed-worker-${nonce}`
  return `(function(){
    var send=globalThis.postMessage.bind(globalThis);
    function mark(probe,outcome){send({type:'mage-worker-boundary-marker',nonce:${JSON.stringify(nonce)},probe:probe,outcome:outcome});}
    function attempt(probe,run){mark(probe,'attempted');try{run(function(outcome){mark(probe,outcome);});}catch(error){mark(probe,'denied');}}
    attempt('fetch',function(done){
      if(typeof globalThis.fetch!=='function'){done('unavailable');return;}
      globalThis.fetch(${JSON.stringify(urls.fetch)},{mode:'no-cors',credentials:'omit',cache:'no-store'}).then(function(){done('allowed');},function(){done('denied');});mark('fetch','returned');
    });
    attempt('xhr',function(done){
      if(typeof globalThis.XMLHttpRequest!=='function'){done('unavailable');return;}
      var xhr=new globalThis.XMLHttpRequest();xhr.open('GET',${JSON.stringify(urls.xhr)},false);xhr.withCredentials=false;xhr.send();mark('xhr','returned');done('allowed');
    });
    attempt('import-script',function(done){
      if(typeof globalThis.importScripts!=='function'){done('unavailable');return;}
      globalThis.importScripts(${JSON.stringify(urls['import-script'])});mark('import-script','returned');done('allowed');
    });
    attempt('indexed-db',function(done){
      if(!globalThis.indexedDB||typeof globalThis.indexedDB.open!=='function'){done('unavailable');return;}
      var request=globalThis.indexedDB.open(${JSON.stringify(sentinel)},1);mark('indexed-db','returned');
      request.onerror=function(event){event.preventDefault();done('denied');};
      request.onsuccess=function(){request.result.close();done('allowed');try{globalThis.indexedDB.deleteDatabase(${JSON.stringify(sentinel)});}catch(error){}};
    });
    attempt('cache-storage',function(done){
      if(!('caches' in globalThis)){done('not-exposed');return;}
      if(!globalThis.caches||typeof globalThis.caches.open!=='function'){done('unavailable');return;}
      globalThis.caches.open(${JSON.stringify(sentinel)}).then(function(){done('allowed');globalThis.caches.delete(${JSON.stringify(sentinel)}).catch(function(){});},function(){done('denied');});mark('cache-storage','returned');
    });
    ${observe ? "setTimeout(function(){mark('observation','timer');},100);" : ''}
  })();`
}
export function workerBoundaryVerdicts(summary: WorkerBoundarySummary, counts: WorkerCanaryCounts | null, control: boolean) {
  const observed = summary.policy.valid && summary.policy.observationTimer && summary.policyObservationMs >= 600
  const denied = (probe: BoundaryProbe) => observed && summary.policy.probes[probe].attempted && summary.policy.probes[probe].outcome === 'denied'
  const cacheNotExposed = summary.policy.probes['cache-storage'].outcome === 'not-exposed' && !summary.policy.probes['cache-storage'].returned
  return [
    { name: 'Parent positive control reaches all fixed network canary counters', passed: control },
    { name: 'Actual compiler worker runs fixed API probes and is retired after validated compilation', passed: summary.started && summary.compiled && summary.terminated
      && summary.production.valid && BOUNDARY_PROBES.every(probe => summary.production.probes[probe].attempted
        && !['allowed', 'unavailable'].includes(summary.production.probes[probe].outcome)
        && (summary.production.probes[probe].outcome === 'not-exposed'
          ? probe === 'cache-storage' && !summary.production.probes[probe].returned
          : summary.production.probes[probe].returned || summary.production.probes[probe].outcome === 'denied')) },
    { name: 'Separate policy worker remains observable for its bounded 600ms window', passed: observed },
    ...NETWORK_PROBES.map(probe => ({ name: `Policy worker denies ${probe}; the fixed canary receives no request`,
      passed: control && counts !== null && counts.requests === 0 && counts.kinds[probe] === 0 && denied(probe) })),
    { name: 'Policy worker denies opening a fresh IndexedDB database', passed: denied('indexed-db') },
    { name: cacheNotExposed ? 'Policy worker CacheStorage is NOT_EXPOSED; no cache could be opened' : 'Policy worker denies opening a fresh CacheStorage cache',
      passed: denied('cache-storage') || (observed && summary.policy.probes['cache-storage'].attempted && cacheNotExposed) },
  ]
}
