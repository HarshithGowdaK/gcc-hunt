const BaseAdapter = require('./BaseAdapter');

class StubAdapter extends BaseAdapter {
  constructor(companyId, companyName, careersUrl, atsName) {
    super(companyId, companyName, careersUrl);
    this.atsName = atsName;
  }
  
  async discoverJobs() {
    console.log(`[StubAdapter] ${this.atsName} - discovery for ${this.companyName} at ${this.careersUrl}`);
    return [];
  }

  async fetchJob(jobUrl, reqId) {
    return '';
  }

  async normalize(jobData) {
    return jobData;
  }
}

module.exports = StubAdapter;
