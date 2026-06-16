const BaseAdapter = require('./BaseAdapter');
const CloudflareResilience = require('../core/CloudflareResilience');
const { sleep, getScrapeLimit } = require('../core/utils');
const JobHelpers = require('../core/JobHelpers');

class GenericAdapter extends BaseAdapter {
  static atsName = 'generic';

  static detect() {
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    const seenUrls = new Set();
    const networkJobs = [];
    this.diagnostics = {
      jobCardCounts: [],
      paginationCount: 0,
      extractedUrlCounts: [],
      indiaFilter: 'unchecked',
    };
    
    try {
      page.on('response', async (response) => {
        try {
          const url = response.url();
          const contentType = String(response.headers()['content-type'] || '').toLowerCase();
          if (!contentType.includes('json')) return;
          if (!/(job|career|position|requisition|search|solr|posting)/i.test(url)) return;
          const data = await response.json();
          const extracted = this._extractJobsFromObject(data, url);
          if (extracted.length > 0) networkJobs.push(...extracted);
        } catch {}
      });

      await page.goto(this.careersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this._ensureIndiaFilterSelected(page);
      let pageNum = 1;
      let hasMore = true;
      let consecutiveNoNewPages = 0;
      const seenPageSignatures = new Set();

      const maxPages = getScrapeLimit('SCRAPE_MAX_PAGES', 100);
      while (hasMore && pageNum <= maxPages) {
        await sleep(3000); // Allow JS rendering
        
        // Auto-scroll to trigger lazy loading if any
        await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 700));
          }
        });

        // Kill any cookie banners intercepting clicks
        await this._killCookieBanners(page);

        // Extract job links
        const rawJobs = await page.evaluate(() => {
          const results = [];
          const blockedTitles = [
            'clear filters', 'load more', 'view all jobs',
            'privacy', 'cookie', 'terms', 'language', 'accessibility', 'learn more',
            'read more', 'about us', 'contact us', 'benefits', 'culture', 'our story',
            'skip', 'english', 'corporate', 'back to', 'search results', 'apply now',
            'save job', 'jobs', 'careers', 'locations'
          ];
          const exactBlockedTitles = new Set(['apply', 'search', 'filter', 'filters', 'clear', 'clear filter', 'clear filters']);
          const countryNames = /^(argentina|australia|austria|belgium|brazil|canada|chile|china|colombia|denmark|finland|france|germany|hong kong|indonesia|ireland|israel|italy|japan|korea|mexico|netherlands|new zealand|norway|poland|portugal|singapore|spain|sweden|switzerland|taiwan|thailand|uk|united kingdom|united states|usa|vietnam)$/i;
          const locationNames = /^(africa|asia|europe|middle east|north america|south america|latin america|emea|apac|americas|global|remote|hybrid|on-site|onsite|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|new delhi|kolkata|ahmedabad|jaipur|indore|india)$/i;
          for (const a of Array.from(document.querySelectorAll('a'))) {
            const href = a.href;
            if (!href) continue;
            
            const hrefLower = href.toLowerCase();
            const isJob = /\/(job|jobs|posting|position|opportunity|opening|jobdetails|jobdetail|job-details|job-description)\//i.test(href) ||
                          /\b(jobid|job_id|jobreqid|jobreq_id|gh_jid|reqid|req_id|career_job_req_id)=/i.test(href) ||
                          /\/careers\/job\//i.test(href);
            
            if (!isJob) continue;

            let title = (a.innerText || '').trim();
            if (!title && a.parentElement) title = a.parentElement.innerText.trim();
            if (!title) continue;
            title = title.split('\n')[0].trim();
            if (title.length < 5) continue;

            const titleLower = title.toLowerCase();
            if (exactBlockedTitles.has(titleLower)) continue;
            if (countryNames.test(titleLower) || locationNames.test(titleLower)) continue;
            if (blockedTitles.some(w => titleLower === w || titleLower.includes(w))) continue;
            if (/[?&](mylocation|location|country|filter|facet)=/i.test(href) &&
              !/[?&](jobid|job_id|jobreqid|jobreq_id|gh_jid|reqid|req_id|career_job_req_id)=/i.test(hrefLower) &&
              !/\/(job|jobs|posting|position|opportunity|opening|jobdetails|jobdetail|job-details|job-description)\//i.test(href)) continue;

            // Extract location heuristically from DOM parents
            let loc = null;
            let p = a.parentElement;
            let depth = 0;
            while (p && depth < 3) {
              const otherJobLinks = Array.from(p.querySelectorAll('a')).filter(otherA => {
                if (otherA === a) return false;
                const otherHref = otherA.href || '';
                if (otherHref === a.href) return false;
                return /\/(job|jobs|posting|position|opportunity|opening|jobdetails|jobdetail|job-details|job-description)\//i.test(otherHref) ||
                       /\b(jobid|job_id|jobreqid|jobreq_id|gh_jid|reqid|req_id|career_job_req_id)=/i.test(otherHref) ||
                       /\/careers\/job\//i.test(otherHref);
              });
              if (otherJobLinks.length > 0) {
                break;
              }
              const m = (p.innerText || '').match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|\bindia\b/i);
              if (m) { loc = m[0]; break; }
              p = p.parentElement; depth++;
            }
            results.push({ title, url: href, location: loc });
          }

          const addFromObject = (value, depth = 0) => {
            if (!value || depth > 8) return;
            if (Array.isArray(value)) {
              value.forEach(item => addFromObject(item, depth + 1));
              return;
            }
            if (typeof value !== 'object') return;

            const title = value.title || value.jobTitle || value.name || value.positionTitle;
            const rawUrl = value.url || value.applyUrl || value.jobUrl || value.absolute_url || value.link;
            const reqId = value.reqId || value.jobReqId || value.id || value.requisitionId;
            if (title && (rawUrl || reqId)) {
              let url = rawUrl || '';
              if (!url && reqId && location.origin) url = `${location.origin}/job/${reqId}`;
              try { url = new URL(url, location.origin).href; } catch {}
              const locationText = value.location || value.locationsText || value.city || value.country || '';
              results.push({
                title: String(title).replace(/\s+/g, ' ').trim(),
                url,
                location: String(locationText || '').replace(/\s+/g, ' ').trim(),
                reqId: reqId ? String(reqId) : ''
              });
            }

            for (const child of Object.values(value)) {
              if (child && (typeof child === 'object')) addFromObject(child, depth + 1);
            }
          };

          for (const script of Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script[id*="DATA"], script'))) {
            const text = script.textContent || '';
            if (!/(job|position|requisition|posting)/i.test(text) || text.length > 2000000) continue;
            const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (!jsonMatch) continue;
            try {
              addFromObject(JSON.parse(jsonMatch[1]));
            } catch {}
          }

          return results;
        });

        this.diagnostics.jobCardCounts.push(rawJobs.length);
        this.diagnostics.extractedUrlCounts.push(rawJobs.filter(item => item.url).length);
        console.log(`[GenericAdapter][Diagnostics] ${this.companyName} page ${pageNum}: jobCardCount=${rawJobs.length}, extractedUrls=${rawJobs.filter(item => item.url).length}`);

        if (rawJobs.length === 0) {
          this.lastFailureReason = 'noCards';
        }

        let newUrlsOnPage = 0;
        const pageSignature = rawJobs
          .map(item => item.url)
          .filter(Boolean)
          .slice(0, 12)
          .join('|');
        const repeatedPage = pageSignature && seenPageSignatures.has(pageSignature);
        if (pageSignature) seenPageSignatures.add(pageSignature);

        for (const item of [...rawJobs, ...networkJobs.splice(0)]) {
          if (!JobHelpers.isLikelyJobUrl(item.url)) continue;
          if (JobHelpers.getJobCandidateRejectionReason(item)) continue;
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            jobs.push(item);
            newUrlsOnPage++;
          }
        }

        if (newUrlsOnPage === 0) consecutiveNoNewPages++;
        else consecutiveNoNewPages = 0;

        if ((repeatedPage && newUrlsOnPage === 0) || consecutiveNoNewPages >= 3) {
          console.log(`[GenericAdapter][Diagnostics] ${this.companyName}: stopping pagination after repeated/no-new page at page ${pageNum}`);
          hasMore = false;
          break;
        }

        const clickedNext = await this._clickNextPage(page);
        if (clickedNext) {
          pageNum++;
          this.diagnostics.paginationCount++;
          await sleep(2000);
        } else {
          hasMore = false;
        }

        if (!clickedNext && newUrlsOnPage === 0 && jobs.length > 0) {
          hasMore = false;
        }
      }
      if (jobs.length === 0 && !this.lastFailureReason) {
        this.lastFailureReason = 'selectorMiss';
      }
      console.log(`[GenericAdapter][Diagnostics] ${this.companyName}: paginationCount=${this.diagnostics.paginationCount}, acceptedUrls=${seenUrls.size}`);
    } catch (err) {
      if (/timeout/i.test(err.message)) this.lastFailureReason = 'timeout';
      else if (/blocked|captcha|403|forbidden/i.test(err.message)) this.lastFailureReason = 'blocked';
      else this.lastFailureReason = 'other';
      console.warn(`[GenericAdapter] Error crawling ${this.careersUrl}: ${err.message}`);
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }

    return jobs;
  }

  async _killCookieBanners(page) {
    await page.evaluate(() => {
      const selectors = [
        '[id*="cookie" i]', '[class*="cookie" i]',
        '[id*="consent" i]', '[class*="consent" i]',
        '#onetrust-banner-sdk', '#onetrust-consent-sdk',
        '#system-ialert'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky' || style.zIndex > 100) {
            el.remove();
          }
        });
      });
    });
  }

  _extractJobsFromObject(value, sourceUrl, depth = 0, results = []) {
    if (!value || depth > 10) return results;
    if (Array.isArray(value)) {
      for (const item of value) this._extractJobsFromObject(item, sourceUrl, depth + 1, results);
      return results;
    }
    if (typeof value !== 'object') return results;

    const job = value.job && typeof value.job === 'object' ? value.job : value;
    const attrs = job.customAttributes || {};
    const attrValue = (key) => {
      const raw = attrs[key];
      if (!raw) return '';
      if (Array.isArray(raw.stringValues)) return raw.stringValues[0] || '';
      if (Array.isArray(raw)) return raw[0] || '';
      return String(raw.value || raw.stringValue || raw || '');
    };
    const title = job.title || job.name || job.jobTitle || job.positionTitle || attrValue('title') || attrValue('title_display');
    const reqId = job.requisitionId || job.reqId || job.jobReqId || job.id || job.guid || value.guid || '';
    const rawUrl = job.url || job.applyUrl || job.jobUrl || job.absolute_url || job.link || value.url || value.link || '';
    const location = job.location || job.location_exact || job.locationsText || job.city || attrValue('city_display') || attrValue('city_display_slug') || attrValue('country_display') || '';
    const description = job.description || job.descriptionPlain || job.shortDescription || job.text || value.description || '';

    if (title && (rawUrl || reqId)) {
      let url = rawUrl;
      if (!url) {
        try {
          const source = new URL(sourceUrl);
          const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          url = `${source.origin}/${String(location || 'india').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${slug}/${reqId}/job/`;
        } catch {
          url = sourceUrl;
        }
      }
      try { url = new URL(url, sourceUrl).href; } catch {}
      results.push({
        title: String(title).replace(/\s+/g, ' ').trim(),
        url,
        location: String(location || '').replace(/\s+/g, ' ').trim(),
        reqId: reqId ? String(reqId) : '',
        _rawText: String(description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      });
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') this._extractJobsFromObject(child, sourceUrl, depth + 1, results);
    }
    return results;
  }

  async _ensureIndiaFilterSelected(page) {
    const indiaSignal = /(india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|kolkata|ahmedabad|jaipur|indore)/i;

    const urlAlreadyFiltered = indiaSignal.test(page.url()) &&
      /location|country|city|where|india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida/i.test(page.url());
    if (urlAlreadyFiltered) {
      this.diagnostics.indiaFilter = 'already_in_url';
      console.log(`[GenericAdapter][Filter] ${this.companyName}: India/city filter already present in URL`);
      return;
    }

    const selectedOnPage = await page.evaluate(() => {
      const india = /(india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|kolkata|ahmedabad|jaipur|indore)/i;
      const selectedSelectors = [
        '[aria-selected="true"]',
        '[aria-checked="true"]',
        '[aria-pressed="true"]',
        'input:checked',
        '[class*="selected" i]',
        '[class*="active" i]',
        '[class*="chip" i]',
        '[class*="tag" i]',
        '[class*="pill" i]'
      ];

      for (const selector of selectedSelectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const label = el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.innerText || el.value || '';
          if (india.test(label)) return true;
        }
      }
      return false;
    });

    if (selectedOnPage) {
      this.diagnostics.indiaFilter = 'already_selected';
      console.log(`[GenericAdapter][Filter] ${this.companyName}: India/city filter already selected`);
      return;
    }

    const clickedExistingFilter = await page.evaluate(() => {
      const india = /\bindia\b/i;
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('label, button, [role="option"], [role="checkbox"], [role="button"], input[type="checkbox"]'));
      const target = candidates.find(el => {
        if (!visible(el)) return false;
        const label = el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.innerText || el.textContent || el.value || '';
        if (!india.test(label.trim())) return false;
        const context = (el.closest('aside, form, fieldset, [class*="filter" i], [id*="filter" i], [class*="location" i], [id*="location" i], [class*="country" i], [id*="country" i]')?.innerText || '').toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        return role === 'option' || role === 'checkbox' || /location|country|city|region|filter/.test(context);
      });
      if (!target) return false;
      target.click();
      return true;
    });

    if (clickedExistingFilter) {
      await sleep(2500);
      this.diagnostics.indiaFilter = 'clicked_existing_india';
      console.log(`[GenericAdapter][Filter] ${this.companyName}: clicked existing India location filter`);
      return;
    }

    const locationInput = page.locator([
      'input[placeholder*="location" i]',
      'input[aria-label*="location" i]',
      'input[name*="location" i]',
      'input[id*="location" i]',
      'input[placeholder*="city" i]',
      'input[aria-label*="city" i]',
      'input[name*="city" i]',
      'input[id*="city" i]',
      'input[placeholder*="where" i]',
      'input[aria-label*="where" i]',
      'input[name*="where" i]',
      'input[id*="where" i]',
      'input[placeholder*="country" i]',
      'input[aria-label*="country" i]',
      'input[name*="country" i]',
      'input[id*="country" i]'
    ].join(', ')).first();

    try {
      if (await locationInput.count()) {
        await locationInput.fill('India', { timeout: 3000 });
        await sleep(600);
        const optionClicked = await page.evaluate(() => {
          const visible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const candidates = Array.from(document.querySelectorAll('[role="option"], li, button, a, div'));
          const target = candidates.find(el => visible(el) && /\bindia\b/i.test((el.innerText || el.textContent || '').trim()));
          if (!target) return false;
          target.click();
          return true;
        });
        if (!optionClicked) await locationInput.press('Enter', { timeout: 3000 });
        await sleep(3000);
        this.diagnostics.indiaFilter = optionClicked ? 'typed_and_selected_india' : 'typed_india_enter';
        console.log(`[GenericAdapter][Filter] ${this.companyName}: applied India location filter via input`);
        return;
      }
    } catch (err) {
      console.warn(`[GenericAdapter][Filter] ${this.companyName}: India input filter attempt failed: ${err.message}`);
    }

    this.diagnostics.indiaFilter = 'not_available';
    console.log(`[GenericAdapter][Filter] ${this.companyName}: no India location filter control found; scanning page and filtering centrally`);
  }

  async _clickNextPage(page) {
    await this._killCookieBanners(page);
    const handle = await page.evaluateHandle(() => {
      const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const disabled = (el) => {
        const className = String(el.className || '');
        return el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          /\b(disabled|inactive)\b/i.test(className);
      };
      return candidates.find(el => {
        if (!visible(el) || disabled(el)) return false;
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const rel = (el.getAttribute('rel') || '').toLowerCase();
        const cls = String(el.className || '').toLowerCase();
        return rel === 'next' ||
          /\b(next|load more|show more|more jobs|view more)\b/i.test(text) ||
          /\b(next|load more|show more|more jobs|view more)\b/i.test(aria) ||
          /\b(next|load-more|show-more|pagination-next)\b/i.test(cls);
      }) || null;
    });

    const nextElement = handle.asElement();
    if (!nextElement) {
      await handle.dispose();
      return false;
    }

    try {
      await nextElement.click({ timeout: 5000 });
      await handle.dispose();
      return true;
    } catch {
      await handle.dispose();
      return false;
    }
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (internalJobRef?._rawText) return internalJobRef._rawText;

    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    let rawText = '';

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      rawText = await page.evaluate(() => {
        const main = document.querySelector('main, article, [class*="job-details" i], [class*="description" i]');
        return (main || document.body).innerText;
      });
      rawText = rawText.replace(/\s+/g, ' ').trim();
    } catch (err) {
      const fallbackText = [
        internalJobRef?.title,
        internalJobRef?.location,
        internalJobRef?.department,
        internalJobRef?.team,
        internalJobRef?._rawText,
      ].filter(Boolean).join(' ');
      if (fallbackText.trim()) {
        console.warn(`[GenericAdapter] Detail fetch failed for ${jobUrl}: ${err.message}. Using listing text fallback.`);
        return fallbackText.replace(/\s+/g, ' ').trim();
      }
      throw err;
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }

    return rawText;
  }

  async normalize(jobData, rawText) {
    return { ...jobData, description: rawText };
  }
}

module.exports = GenericAdapter;
