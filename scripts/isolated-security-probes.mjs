export function reportProbeSource(nonce, checks) {
  return `globalThis.parent.postMessage({type:'mage-isolation-probe',nonce:${JSON.stringify(nonce)},checks:${checks}},'*');`
}
export const THROW_PROBE_SOURCE = "throw new Error('Fixed isolation throw probe');"

export const STALL_MARKERS = Object.freeze(['queued', 'scheduled', 'start', 'end'])
const MAX_CHILD_TIME_MS = 86400000

/** Validate identity and the entire fixed schema before accepting any child marker. */
export function readStallMarker(event, source, nonce) {
  if (!source || event.source !== source || event.origin !== 'null' || !/^[a-f0-9]{32}$/.test(nonce)) return null
  const value = event.data
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'atMs,marker,nonce,type'
    || value.type !== 'mage-isolation-stall' || value.nonce !== nonce || !STALL_MARKERS.includes(value.marker)
    || !Number.isFinite(value.atMs) || value.atMs < 0 || value.atMs > MAX_CHILD_TIME_MS) return null
  return { marker: value.marker, atMs: value.atMs }
}

/** Child-relative timestamps describe emission; the parent separately records receipt. */
export function boundedStallSource(nonce) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid fixed probe.')
  return `(function(){var origin=performance.now();
    var mark=function(marker){globalThis.parent.postMessage({type:'mage-isolation-stall',nonce:${JSON.stringify(nonce)},marker:marker,atMs:performance.now()-origin},'*');};
    mark('queued');
    setTimeout(function(){mark('start');var until=performance.now()+3000;while(performance.now()<until){}mark('end');},150);
    mark('scheduled');
  })();`
}

/** Fixed ES2017 probes: the embedded ShaderPark parser does not accept object spread. */
export function portAttackSource(mode, nonce) {
  if (!['window', 'spoof', 'flood'].includes(mode) || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid fixed probe.')
  const attack = mode === 'window'
    ? "globalThis.parent.postMessage(Object.assign({},message,{type:'error',payload:{code:'render'}}),'*');"
    : mode === 'spoof' ? "original.call(port,Object.assign({},message,{type:'navigate',payload:{url:'https://invalid.example/'}}));"
      : "for(var i=0;i<50;i++)original.call(port,Object.assign({},message,{payload:{frames:i+100}}));"
  return `(function(){var original=globalThis.MessagePort.prototype.postMessage;var sent=false;
    globalThis.MessagePort.prototype.postMessage=function(message,transfer){
      if(!sent&&message&&message.protocol==='mage-isolated-renderer'&&message.type==='progress'){
        sent=true;globalThis.MessagePort.prototype.postMessage=original;
        ${reportProbeSource(nonce, "{'probe-executed':true}")}
        ${mode === 'window' ? attack : `var port=this;setTimeout(function(){${attack}},150);`}
      }
      return original.call(this,message,transfer);
    };
  })();`
}
