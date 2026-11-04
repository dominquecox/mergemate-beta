import { AgentError, limitedResponseText } from './agent-policy.mjs';

export class WorkflowBridge {
  constructor(policy, credential, { fetcher = fetch, accessClientId, accessClientSecret } = {}) {
    if (!credential || credential.length < 64 || /[\r\n]/.test(credential)) throw new AgentError('runner_unconfigured', 'Configure the signed workflow runner credential.');
    if (!accessClientId || !accessClientSecret || /[\r\n]/.test(accessClientId + accessClientSecret)) throw new AgentError('access_unconfigured', 'Configure the Cloudflare Access service token for the runner.');
    this.policy = policy; this.credential = credential; this.fetcher = fetcher;this.accessClientId=accessClientId;this.accessClientSecret=accessClientSecret;
  }
  async post(route, body, signal) {
    if (!/^(?:heartbeat|claim|jobs\/[a-z\d_-]+\/(?:lease|patch|report))$/i.test(route)) throw new AgentError('invalid_bridge_route', 'Invalid workflow bridge operation.');
    const response = await this.fetcher(`${this.policy.serverOrigin}/internal/workflows/${route}`, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000), headers: { authorization: `Bearer ${this.credential}`, 'CF-Access-Client-Id':this.accessClientId,'CF-Access-Client-Secret':this.accessClientSecret,'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new AgentError(response.status === 409 || response.status === 410 ? 'lease_revoked' : 'bridge_failed', `Workflow bridge refused operation (${response.status}).`, response.status === 409 || response.status === 410 ? 'cancelled' : 'blocked');
    const raw = await limitedResponseText(response, 262144); if (Buffer.byteLength(raw) > 262144) throw new AgentError('bridge_limit', 'Workflow bridge response exceeds limit.');
    try { return JSON.parse(raw); } catch { throw new AgentError('bridge_response', 'Workflow bridge returned invalid data.'); }
  }
  heartbeat(capabilities, signal, repositories = this.policy.repositories) { return this.post('heartbeat', { runnerId: this.policy.runnerId, repositories, capabilities, version: '1' }, signal); }
  async claim(signal) { return (await this.post('claim', { runnerId: this.policy.runnerId }, signal)).job ?? null; }
  jobOperation(job, operation, value = {}, signal) { return this.post(`jobs/${job.id}/${operation}`, { runnerId: this.policy.runnerId, leaseToken: job.leaseToken, ...value }, signal); }
}

export class LeaseGuard {
  constructor(bridge, job, signal, { intervalMs = 10000 } = {}) {
    this.bridge = bridge; this.job = job; this.controller = new AbortController(); this.signal = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal; this.inFlight = null;
    this.timer = setInterval(() => { void this.assertActive().catch(() => {}); }, intervalMs);
  }
  async assertActive() {
    if (this.signal.aborted) throw new AgentError('cancelled', 'Workflow job was cancelled or stopped.', 'cancelled');
    if (!this.inFlight) this.inFlight = this.bridge.jobOperation(this.job, 'lease', {}, this.signal).then(result => {
      if (result.active !== true || result.cancelled || !Number.isFinite(Date.parse(result.leaseExpiresAt)) || Date.parse(result.leaseExpiresAt) <= Date.now()) throw new AgentError('lease_revoked', 'Workflow job lease is no longer active.', 'cancelled');
    }).catch(error => { this.controller.abort(); throw error; }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  stop() { clearInterval(this.timer); }
}
