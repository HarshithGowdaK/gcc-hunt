const ArbitrationAI = require('./scripts/core/ArbitrationAI');
const locScore = { confidence: 0.9, resolvedLocation: 'India' };
const expResult = { minYears: null, confidence: 0.5, hasMultipleRanges: false };
ArbitrationAI.arbitrate({ title: 'Skip to main content', location: '' }, locScore, expResult, 'test_comp', 'Skip to main content')
  .then(res => console.log('Success'))
  .catch(err => console.error(err.stack));
