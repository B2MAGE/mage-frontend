export function reportProbeSource(nonce, checks) {
  return `globalThis.parent.postMessage({type:'mage-isolation-probe',nonce:${JSON.stringify(nonce)},checks:${checks}},'*');`
}
export const THROW_PROBE_SOURCE = "throw new Error('Fixed isolation throw probe');"

/** Explicit fixture only: evidence is delivered before a finite three-second stall. */
export function boundedStallSource(nonce) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid fixed probe.')
  return `${reportProbeSource(nonce, "{'probe-executed':true}")}setTimeout(function(){var until=performance.now()+3000;while(performance.now()<until){}},150);`
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
