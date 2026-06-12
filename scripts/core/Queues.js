'use strict';

class AdaptiveQueue {
  constructor(name, initialConcurrency, workerFn) {
    this.name = name;
    this.concurrency = initialConcurrency;
    this.maxConcurrency = initialConcurrency * 3;
    this.minConcurrency = Math.max(1, Math.floor(initialConcurrency / 2));
    this.workerFn = workerFn;
    this.queue = [];
    this.activeWorkers = 0;
    this.isProcessing = false;
    this.recentResponseTimes = [];
    this.failureCount = 0;
    this.successCount = 0;
  }

  enqueue(item) {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      this.process();
    });
  }

  _recordResponseTime(ms) {
    this.recentResponseTimes.push(ms);
    if (this.recentResponseTimes.length > 20) this.recentResponseTimes.shift();
  }

  _adaptAfterSuccess(elapsed) {
    this.successCount++;
    this.failureCount = Math.max(0, this.failureCount - 1);
    this._recordResponseTime(elapsed);

    const avg = this.recentResponseTimes.reduce((a, b) => a + b, 0) / this.recentResponseTimes.length;
    if (avg < 2000 && this.concurrency < this.maxConcurrency && this.failureCount === 0) {
      this.concurrency = Math.min(this.maxConcurrency, this.concurrency + 1);
    }
  }

  _adaptAfterFailure(err, elapsed) {
    this.failureCount++;
    this._recordResponseTime(elapsed);
    const msg = err?.message || '';
    const isRateLimit = /429|rate limit|timeout|503/i.test(msg);
    if (isRateLimit || this.failureCount > 3) {
      this.concurrency = Math.max(this.minConcurrency, this.concurrency - 2);
      console.warn(`[Queue:${this.name}] Throttling — concurrency now ${this.concurrency}`);
    }
  }

  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeWorkers < this.concurrency) {
      const { item, resolve, reject } = this.queue.shift();
      this.activeWorkers++;
      const start = Date.now();

      this.workerFn(item)
        .then(res => {
          this._adaptAfterSuccess(Date.now() - start);
          resolve(res);
          this.activeWorkers--;
          this.process();
        })
        .catch(err => {
          this._adaptAfterFailure(err, Date.now() - start);
          reject(err);
          this.activeWorkers--;
          this.process();
        });
    }
    this.isProcessing = false;
  }

  async drain() {
    while (this.queue.length > 0 || this.activeWorkers > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getStats() {
    return {
      name: this.name,
      concurrency: this.concurrency,
      queueDepth: this.queue.length,
      activeWorkers: this.activeWorkers,
      failureCount: this.failureCount,
    };
  }
}

class Queues {
  constructor() {
    this.discoveryQueue = null;
    this.detailQueue = null;
    this.classificationQueue = null;
    this.aiQueue = null;
  }

  init(workers) {
    this.discoveryQueue = new AdaptiveQueue('Discovery', 5, workers.discovery);
    this.detailQueue = new AdaptiveQueue('Detail', parseInt(process.env.DETAIL_CONCURRENCY) || 15, workers.detail);
    this.classificationQueue = new AdaptiveQueue('Classification', 10, workers.classification);
    this.aiQueue = new AdaptiveQueue('AI', 3, workers.ai);
    this.aiQueue.maxConcurrency = 5;
  }

  async drainAll() {
    const checkActive = () => {
      const queues = [this.discoveryQueue, this.detailQueue, this.classificationQueue, this.aiQueue];
      return queues.some(q => q && (q.queue.length > 0 || q.activeWorkers > 0));
    };
    while (checkActive()) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  getAllStats() {
    const queues = [this.discoveryQueue, this.detailQueue, this.classificationQueue, this.aiQueue];
    return queues.filter(Boolean).map(q => q.getStats());
  }
}

module.exports = new Queues();
