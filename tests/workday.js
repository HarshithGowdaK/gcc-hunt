const axios = require('axios');
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'Accept': 'application/json'
};

async function test() {
  const url = 'https://3m.wd1.myworkdayjobs.com/wday/cxs/3m/Search/jobs';
  const res = await axios.post(url, { appliedFacets: {}, limit: 5, offset: 0, searchText: '' }, { headers });
  console.log('3M Jobs:', res.data.jobPostings.length);
  const path = res.data.jobPostings[0].externalPath;
  console.log('3M Path:', path);

  const detailUrl = `https://3m.wd1.myworkdayjobs.com/wday/cxs/3m/Search${path}`;
  console.log('Detail URL:', detailUrl);
  try {
    const detailRes = await axios.get(detailUrl, { headers });
    console.log('Detail Length:', detailRes.data.jobPostingInfo.jobDescription.length);
  } catch (e) {
    console.log('Detail Error:', e.response?.status, e.message);
  }
}
test();
