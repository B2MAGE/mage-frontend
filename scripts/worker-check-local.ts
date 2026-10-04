import { installFixedWorkerCheck } from './worker-check-child'
import { WORKER_CHECK_PARENT } from './worker-check-fixture'

const statusElement = document.getElementById('renderer-status')
if (!statusElement) throw new Error('The fixed worker-check document is incomplete.')
installFixedWorkerCheck({ statusElement, allowedParentOrigins: [WORKER_CHECK_PARENT] })
