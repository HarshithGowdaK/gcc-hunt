const { axiosRequest, sleep, getScrapeLimit } = require('../core/utils');
const BaseAdapter = require('./BaseAdapter');

const AXIOS_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

const successfulEndpoints = {};

class WorkdayAdapter extends BaseAdapter {
  static atsName = 'workday';

  static detect(url, html) {
    if (/myworkdayjobs\.com/i.test(url)) return { ats: 'workday', confidence: 0.98, method: 'url' };
    if (html && /wday\/cxs/i.test(html)) return { ats: 'workday', confidence: 0.88, method: 'html' };
    if (html && /myworkdayjobs/i.test(html)) return { ats: 'workday', confidence: 0.65, method: 'html_weak' };
    return null;
  }

  _buildAppliedFacets() {
    const parsed = new URL(this.careersUrl);
    const facets = {};
    const ignored = new Set(['q', 'query', 'searchText', 'search', 'locations']);

    for (const [key, value] of parsed.searchParams.entries()) {
      if (!value || ignored.has(key)) continue;
      if (!facets[key]) facets[key] = [];
      facets[key].push(value);
    }

    const locationValues = parsed.searchParams.getAll('locations');
    if (locationValues.length > 0) {
      facets.locations = locationValues;
    }

    return facets;
  }

  _buildApiPayloads(limit, offset) {
    const appliedFacets = this._buildAppliedFacets();
    const payloads = [
      { appliedFacets, limit, offset, searchText: '' },
    ];

    if (Object.keys(appliedFacets).length > 0) {
      payloads.push({ appliedFacets: {}, limit, offset, searchText: '' });
    }

    payloads.push({ limit, offset, searchText: '' });
    return payloads;
  }

  _candidateTenants(host) {
    const base = host.split('.')[0];
    const candidates = [base];
    const compactCompany = String(this.companyName || '').replace(/[^a-zA-Z0-9]/g, '');
    if (compactCompany) {
      candidates.push(compactCompany);
      candidates.push(compactCompany.toLowerCase());
      candidates.push(compactCompany.toUpperCase());
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  _candidateSites(pathSegments, discoveredSite) {
    const candidates = [discoveredSite, 'Search'];
    for (const segment of pathSegments) {
      if (!/^[a-z]{2}(?:-[A-Z]{2})?$/i.test(segment)) candidates.push(segment);
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  async _fetchJobsFromApi(apiUrl, host, tenant, site, limit = 20) {
    const jobs = [];
    const seen = new Set();

    const maxOffset = getScrapeLimit('SCRAPE_MAX_OFFSET', 5000);
    for (let offset = 0; offset <= maxOffset; offset += limit) {
      let response = null;
      let lastError = null;
      const payloads = this._buildApiPayloads(limit, offset);

      for (const payload of payloads) {
        try {
          response = await axiosRequest({
            url: apiUrl,
            method: 'POST',
            data: payload,
            headers: { ...AXIOS_HEADERS, 'Content-Type': 'application/json' },
            timeout: 15000
          });
          break;
        } catch (err) {
          lastError = err;
          if (err.response?.status !== 400) throw err;
          console.warn(`[Workday] ${this.companyName}: payload rejected at offset=${offset}; retrying variant`);
        }
      }

      if (!response) throw lastError || new Error('Workday API request failed');

      const postings = response.data.jobPostings || [];
      console.log(`[Workday] ${this.companyName}: offset=${offset}, postings=${postings.length}`);
      for (const posting of postings) {
        const key = posting.jobReqId || posting.externalPath || posting.title;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push({
          title: posting.title,
          location: posting.locationsText || '',
          url: `https://${host}/${site.toLowerCase()}${posting.externalPath}`,
          reqId: posting.jobReqId || '',
          _detailApiUrl: `https://${host}/wday/cxs/${tenant}/${site}${posting.externalPath}`
        });
      }

      const total = response.data.total || response.data.totalCount || response.data.count;
      if (postings.length < limit) break;
      if (total && jobs.length >= total) break;
    }

    return jobs;
  }

  async discoverJobs() {
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);

    // Check cached endpoint first
    if (successfulEndpoints[this.companyId]) {
      const apiUrl = successfulEndpoints[this.companyId];
      console.log(`[Workday] Using cached successful endpoint for ${this.companyName}: ${apiUrl}`);
      try {
        const site = apiUrl.split('/').slice(-2)[0]; // extract site segment
        const tenant = apiUrl.split('/').slice(-3)[0]; // extract tenant segment
        const jobs = await this._fetchJobsFromApi(apiUrl, host, tenant, site);

        this.recordSuccess(jobs.length);
        return jobs;
      } catch (err) {
        console.warn(`[Workday] Cached endpoint failed, re-discovering: ${err.message}`);
        delete successfulEndpoints[this.companyId];
      }
    }

    // Default guesses
    let tenant = host.split('.')[0];
    let site = 'Search';
    if (pathSegments.length > 1) {
      site = pathSegments[1];
    } else if (pathSegments.length === 1 && pathSegments[0] !== 'en-US') {
      site = pathSegments[0];
    }

    let html = '';
    let isBlocked = false;

    // Step 1: Pre-fetch HTML using Axios to check for config or 403 block
    try {
      const response = await axiosRequest({
        url: this.careersUrl,
        method: 'GET',
        headers: AXIOS_HEADERS,
        timeout: 15000
      });
      html = typeof response.data === 'string' ? response.data : '';
    } catch (err) {
      console.warn(`[Workday] Axios pre-fetch failed for ${this.companyName}: ${err.message}`);
      if (err.response?.status === 403) {
        isBlocked = true;
      }
    }

    // If blocked with 403, immediately run browser-based discovery
    if (isBlocked) {
      console.log(`[Workday] Got 403 for ${this.companyName}. Switching to Playwright browser context.`);
      return await this._discoverJobsViaBrowser();
    }

    // If we have HTML, search for configurations and embedded data
    if (html) {
      // A. Extract from JSON-LD
      const jsonLdJobs = this._extractJobsFromJsonLd(html);
      if (jsonLdJobs && jsonLdJobs.length > 0) {
        console.log(`[Workday] Found ${jsonLdJobs.length} jobs via JSON-LD in HTML for ${this.companyName}`);
        this.recordSuccess(jsonLdJobs.length);
        return jsonLdJobs;
      }

      // B. Extract from Embedded state
      const embeddedJobs = this._extractEmbeddedStateJobs(html, host, site, tenant);
      if (embeddedJobs && embeddedJobs.length > 0) {
        console.log(`[Workday] Found ${embeddedJobs.length} jobs via embedded state in HTML for ${this.companyName}`);
        this.recordSuccess(embeddedJobs.length);
        return embeddedJobs;
      }

      // C. Extract tenant/site parameters
      const discovered = this._discoverTenantAndSite(html, this.careersUrl);
      tenant = discovered.tenant;
      site = discovered.site;
    }

    // Step 2: Try to call the API directly using Axios
    const endpointCandidates = [];
    for (const candidateTenant of this._candidateTenants(host)) {
      for (const candidateSite of this._candidateSites(pathSegments, site)) {
        endpointCandidates.push({
          tenant: candidateTenant,
          site: candidateSite,
          apiUrl: `https://${host}/wday/cxs/${candidateTenant}/${candidateSite}/jobs`
        });
      }
    }
    let lastApiError = null;
    try {
      for (const endpoint of endpointCandidates) {
        try {
          const jobs = await this._fetchJobsFromApi(endpoint.apiUrl, host, endpoint.tenant, endpoint.site);

          successfulEndpoints[this.companyId] = endpoint.apiUrl;

          this.recordSuccess(jobs.length);
          return jobs;
        } catch (err) {
          lastApiError = err;
          console.warn(`[Workday] Endpoint failed for ${this.companyName}: ${endpoint.apiUrl} (${err.response?.status || err.message})`);
        }
      }
    } catch (err) {
      lastApiError = err;
    }

    if (lastApiError) {
      console.log({
        company: this.companyName,
        ats: 'workday',
        endpoint: endpointCandidates.map(e => e.apiUrl),
        status: lastApiError.response?.status || null,
        headers: lastApiError.response?.headers || null,
        error: lastApiError.message
      });

      if (lastApiError.response?.status === 403) {
        console.log(`[Workday] Got 403 on API call for ${this.companyName}. Switching to Playwright browser context.`);
        return await this._discoverJobsViaBrowser();
      }
    }

    // Fallback if Axios failed (but not 403)
    console.log(`[Workday] Axios API calls failed for ${this.companyName}. Running browser context fallback.`);
    return await this._discoverJobsViaBrowser();
  }

  async _discoverJobsViaBrowser() {
    const CloudflareResilience = require('../core/CloudflareResilience');
    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const site = pathSegments.length > 1 ? pathSegments[1] : (pathSegments[0] || 'Search');
    const tenant = host.split('.')[0];
    const networkJobs = [];

    try {
      page.on('response', async (response) => {
        try {
          if (!/\/wday\/cxs\/.*\/jobs(?:\?|$)/i.test(response.url())) return;
          const data = await response.json();
          const postings = data.jobPostings || data.postings || data.jobs || [];
          for (const posting of postings) {
            networkJobs.push({
              title: posting.title,
              location: posting.locationsText || posting.location || '',
              url: posting.externalPath ? `https://${host}/${site.toLowerCase()}${posting.externalPath}` : (posting.url || ''),
              reqId: posting.jobReqId || posting.reqId || '',
              _detailApiUrl: posting.externalPath ? `https://${host}/wday/cxs/${tenant}/${site}${posting.externalPath}` : null
            });
          }
        } catch {}
      });

      await page.goto(this.careersUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);

      await page.evaluate(async () => {
        if (!document.body) return;
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1000));
      });

      if (networkJobs.length > 0) {
        const deduped = this._dedupeJobs(networkJobs);
        this.recordSuccess(deduped.length);
        return deduped;
      }

      const dataStr = await page.evaluate(() => {
        const win = window;
        const state = win.windowData || win.__WD_CONFIG__ || win.__NEXT_DATA__ || win.__INITIAL_STATE__ || win.__PRELOADED_STATE__;
        if (state) return JSON.stringify(state);

        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        if (scripts.length > 0) {
          return JSON.stringify(scripts.map(s => s.innerHTML));
        }
        return null;
      });

      if (dataStr) {
        let extracted = null;
        try {
          const parsedData = JSON.parse(dataStr);
          if (Array.isArray(parsedData)) {
            for (const scriptContent of parsedData) {
              const ldJobs = this._extractJobsFromJsonLd(scriptContent);
              if (ldJobs && ldJobs.length > 0) {
                extracted = ldJobs;
                break;
              }
            }
          } else {
            const tenant = host.split('.')[0];
            const site = 'Search';
            const postings = this._findPostingsInObject(parsedData);
            if (postings && postings.length > 0) {
              extracted = postings.map(p => ({
                title: p.title,
                location: p.locationsText || p.location || '',
                url: p.externalPath ? `https://${host}/${site.toLowerCase()}${p.externalPath}` : (p.url || ''),
                reqId: p.jobReqId || p.reqId || '',
                _detailApiUrl: p.externalPath ? `https://${host}/wday/cxs/${tenant}/${site}${p.externalPath}` : null
              }));
            }
          }
        } catch (e) {}

        if (extracted && extracted.length > 0) {
          this.recordSuccess(extracted.length);
          return extracted;
        }
      }

      // Generic page link extraction inside Playwright
      const rawJobs = await page.evaluate(() => {
        const results = [];
        for (const a of Array.from(document.querySelectorAll('a'))) {
          const href = a.href;
          if (!href) continue;
          if (href.includes('myworkdayjobs') || /\/(job|jobs|posting|position|opportunity|opening)\//i.test(href)) {
            let title = (a.innerText || '').trim().split('\n')[0].trim();
            if (title.length < 3) continue;
            results.push({ title, url: href, location: '' });
          }
        }
        return results;
      });

      if (rawJobs && rawJobs.length > 0) {
        const jobs = rawJobs.map(rj => ({
          title: rj.title,
          location: rj.location,
          url: rj.url,
          reqId: ''
        }));
        this.recordSuccess(jobs.length);
        return jobs;
      }
    } catch (err) {
      console.warn(`[Workday Browser discovery] Failed for ${this.companyName}: ${err.message}`);
    } finally {
      await page.close();
      await CloudflareResilience.releaseContext(context);
    }

    throw new Error(`Workday browser discovery failed for ${this.companyName}`);
  }

  _dedupeJobs(jobs) {
    const seen = new Set();
    const result = [];
    for (const job of jobs) {
      const key = job.reqId || job.url || `${job.title}:${job.location}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(job);
    }
    return result;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (internalJobRef && internalJobRef._rawText) {
      return internalJobRef._rawText;
    }
    if (!internalJobRef || !internalJobRef._detailApiUrl) {
      return '';
    }
    const response = await axiosRequest({
      url: internalJobRef._detailApiUrl,
      method: 'GET',
      headers: AXIOS_HEADERS,
      timeout: 15000
    });
    if (response.data?.jobPostingInfo) {
      const info = response.data.jobPostingInfo;
      const locationText = [
        info.location,
        info.locationsText,
        info.country,
        info.primaryLocation,
      ].filter(Boolean).join(' ');
      const description = (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
      return `${locationText} ${description}`.replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  _extractJobsFromJsonLd(html) {
    const jsonLdRegex = /<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi;
    let match;
    const jobs = [];
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1].trim());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            let location = '';
            if (item.jobLocation) {
              const locObj = item.jobLocation;
              if (locObj.address) {
                location = [
                  locObj.address.addressLocality,
                  locObj.address.addressRegion,
                  locObj.address.addressCountry
                ].filter(Boolean).join(', ');
              }
            }
            jobs.push({
              title: item.title,
              location,
              url: item.url || '',
              reqId: item.identifier?.value || item.identifier || '',
              _rawText: (item.description || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
            });
          }
        }
      } catch (e) {}
    }
    return jobs.length > 0 ? jobs : null;
  }

  _extractEmbeddedStateJobs(html, host, site, tenant) {
    const keys = ['__INITIAL_STATE__', '__NEXT_DATA__', '__PRELOADED_STATE__'];
    for (const key of keys) {
      const regex = new RegExp(`window\\.${key}\\s*=\\s*({[\\s\\S]*?})(?:;|\\n|$)`, 'i');
      let match = html.match(regex);
      if (!match && key === '__NEXT_DATA__') {
        const scriptRegex = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"\s*>([\s\S]*?)<\/script>/i;
        match = html.match(scriptRegex);
      }
      if (match) {
        try {
          const obj = JSON.parse(match[1].trim());
          const postings = this._findPostingsInObject(obj);
          if (postings && postings.length > 0) {
            return postings.map(p => ({
              title: p.title,
              location: p.locationsText || p.location || '',
              url: p.externalPath ? `https://${host}/${site.toLowerCase()}${p.externalPath}` : (p.url || ''),
              reqId: p.jobReqId || p.reqId || '',
              _detailApiUrl: p.externalPath ? `https://${host}/wday/cxs/${tenant}/${site}${p.externalPath}` : null
            }));
          }
        } catch (e) {}
      }
    }
    return null;
  }

  _findPostingsInObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj.jobPostings)) return obj.jobPostings;
    if (Array.isArray(obj.postings)) return obj.postings;
    if (Array.isArray(obj.jobs)) return obj.jobs;
    if (Array.isArray(obj.searchResults)) return obj.searchResults;
    for (const key of Object.keys(obj)) {
      const res = this._findPostingsInObject(obj[key]);
      if (res) return res;
    }
    return null;
  }

  _discoverTenantAndSite(html, careersUrl) {
    const parsed = new URL(careersUrl);
    let host = parsed.hostname;
    let pathSegments = parsed.pathname.split('/').filter(Boolean);

    let tenant = host.split('.')[0];
    let site = 'Search';

    const regex = /\/wday\/cxs\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-]+)/i;
    const match = html.match(regex);
    if (match) {
      return { tenant: match[1], site: match[2] };
    }

    const tenantMatch = html.match(/"tenant"\s*:\s*"([a-zA-Z0-9_\-]+)"/i);
    const siteMatch = html.match(/"siteId"\s*:\s*"([a-zA-Z0-9_\-]+)"/i);
    if (tenantMatch && siteMatch) {
      return { tenant: tenantMatch[1], site: siteMatch[2] };
    }

    if (host.match(/^wd\d+\.myworkdayjobs\.com/i)) {
      if (pathSegments.length > 0) {
        const isLocale = /^[a-z]{2}-[a-z]{2}$/i.test(pathSegments[0]) || /^[a-z]{2}$/i.test(pathSegments[0]);
        if (isLocale) {
          tenant = pathSegments[1] || tenant;
          site = pathSegments[2] || 'Search';
        } else {
          tenant = pathSegments[0];
          site = pathSegments[1] || 'Search';
        }
      }
    } else {
      if (pathSegments.length > 0) {
        const isLocale = /^[a-z]{2}-[a-z]{2}$/i.test(pathSegments[0]) || /^[a-z]{2}$/i.test(pathSegments[0]);
        if (isLocale) {
          site = pathSegments[1] || 'Search';
        } else {
          site = pathSegments[0];
        }
      }
    }

    return { tenant, site };
  }
}

module.exports = WorkdayAdapter;
