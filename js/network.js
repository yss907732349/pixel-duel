(function (root) {
  'use strict';
  class DuelNetwork {
    constructor(callbacks = {}) {
      this.callbacks = callbacks;
      this.active = false;
      this.busy = false;
      this.ws = null;
      this.heartbeat = null;
      this.retry = null;
      this.session = null;
      this.generation = 0;
    }
    notify(message, error = false) { this.callbacks.status?.(message, error); }
    static endpoint(value) {
      const url = new URL(value || location.origin);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请填写完整的 http 或 https 房间服务地址。');
      if (location.protocol === 'https:' && ['http:', 'ws:'].includes(url.protocol)) throw new Error('当前网页使用安全连接，请填写 https 房间服务地址。');
      url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
      url.pathname = '/ws';
      return url.href;
    }
    async enter(type, data, address) {
      if (this.active || this.busy) return;
      const endpoint = DuelNetwork.endpoint(address);
      this.busy = true;
      this.notify('正在连接房间服务…免费服务首次唤醒可能需要约一分钟。');
      this.connect(endpoint, { type, ...data });
    }
    connect(endpoint, request) {
      this.busy = true;
      clearTimeout(this.retry);
      clearInterval(this.heartbeat);
      const generation = ++this.generation;
      this.ws?.close();
      const ws = new WebSocket(endpoint);
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (generation !== this.generation || !this.busy) return;
        if (this.session) {
          this.forget();
          this.notify('重连时间已过，请重新加入房间。', true);
        } else {
          this.busy = false;
          ws.close();
          this.notify('连接超时，请检查服务地址，稍后再试。', true);
        }
      }, request.type === 'resume' ? Math.max(1, Math.min(28000, (this.reconnectUntil || Date.now() + 28000) - Date.now())) : 75000);
      ws.addEventListener('open', () => {
        if (generation !== this.generation) return;
        ws.send(JSON.stringify(request));
        this.heartbeat = setInterval(() => this.send({ type: 'ping', at: Date.now() }), 3000);
      });
      ws.addEventListener('message', event => {
        if (generation !== this.generation) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'joined') {
          clearTimeout(timeout);
          this.busy = false;
          this.active = true;
          this.reconnectUntil = 0;
          this.session = { code: message.code, token: message.token, playerId: message.playerId, endpoint };
          try { sessionStorage.setItem('duel-room', JSON.stringify(this.session)); } catch {}
          this.callbacks.joined?.(message);
        } else if (message.type === 'state') this.callbacks.state?.(message);
        else if (message.type === 'pong') this.callbacks.latency?.(Math.max(0, Date.now() - message.at));
        else if (message.type === 'closed') {
          this.forget();
          this.notify(message.message || '房间已关闭，请重新创建或加入。', true);
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.busy = false;
          if (request.type === 'resume' && !this.active) this.forget();
          this.notify(message.message || '操作未完成，请重试。', true);
        }
      });
      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        if (generation !== this.generation) return;
        clearInterval(this.heartbeat);
        this.busy = false;
        if (this.session) {
          this.active = false;
          this.callbacks.disconnected?.();
          this.reconnectUntil = this.reconnectUntil || Date.now() + 28000;
          if (Date.now() < this.reconnectUntil) {
            this.notify('连接中断，战斗已暂停，正在尝试重连…', true);
            this.retry = setTimeout(() => this.connect(endpoint, { type: 'resume', code: this.session.code, token: this.session.token }), 1000);
          } else {
            this.forget();
            this.notify('重连时间已过，请重新加入房间。', true);
          }
        } else this.notify('未连接房间服务，请检查地址后重试。', true);
      });
      ws.addEventListener('error', () => {});
    }
    send(message) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
        return true;
      }
      return false;
    }
    restore() {
      let session;
      try { session = JSON.parse(sessionStorage.getItem('duel-room')); } catch {}
      if (!session?.code || !session.token || !session.endpoint) return;
      try { DuelNetwork.endpoint(session.endpoint); } catch { return; }
      this.session = session;
      this.busy = true;
      this.reconnectUntil = Date.now() + 28000;
      this.notify('正在恢复上次的房间…');
      this.connect(session.endpoint, { type: 'resume', code: session.code, token: session.token });
    }
    forget() {
      this.generation++;
      clearTimeout(this.retry);
      clearInterval(this.heartbeat);
      this.ws?.close();
      this.active = false;
      this.busy = false;
      this.session = null;
      try { sessionStorage.removeItem('duel-room'); } catch {}
      this.callbacks.left?.();
    }
    leave() {
      this.send({ type: 'leave' });
      this.generation++;
      clearTimeout(this.retry);
      clearInterval(this.heartbeat);
      this.ws?.close();
      this.forget();
    }
  }
  root.DuelNetwork = DuelNetwork;
})(window);
