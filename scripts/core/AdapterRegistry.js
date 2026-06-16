'use strict';

const WorkdayAdapter = require('../adapters/WorkdayAdapter');
const GreenhouseAdapter = require('../adapters/GreenhouseAdapter');
const LeverAdapter = require('../adapters/LeverAdapter');
const SmartRecruitersAdapter = require('../adapters/SmartRecruitersAdapter');
const EightfoldAdapter = require('../adapters/EightfoldAdapter');
const OracleAdapter = require('../adapters/OracleAdapter');
const GenericAdapter = require('../adapters/GenericAdapter');
const BrowserATSAdapter = require('../adapters/BrowserATSAdapter');
const SuccessFactorsAdapter = require('../adapters/SuccessFactorsAdapter');
const BrassringAdapter = require('../adapters/BrassringAdapter');

const BROWSER_ATS = [
  'cornerstone', 'icims', 'taleo', 'avature',
  'jobvite', 'beamery', 'custom', 'phenom',
];

const registry = {
  workday: WorkdayAdapter,
  greenhouse: GreenhouseAdapter,
  lever: LeverAdapter,
  smartrecruiters: SmartRecruitersAdapter,
  eightfold: EightfoldAdapter,
  oracle: OracleAdapter,
  successfactors: SuccessFactorsAdapter,
  brassring: BrassringAdapter,
  sap: SuccessFactorsAdapter,
  generic: GenericAdapter,
};

for (const name of BROWSER_ATS) {
  registry[name] = BrowserATSAdapter;
}

function getAdapterClass(atsName) {
  return registry[atsName] || registry.generic;
}

function createAdapter(atsName, companyId, companyName, careersUrl) {
  const AdapterClass = getAdapterClass(atsName);
  return new AdapterClass(companyId, companyName, careersUrl, atsName);
}

function listRegisteredATS() {
  return Object.keys(registry);
}

module.exports = {
  getAdapterClass,
  createAdapter,
  listRegisteredATS,
  registry,
};
