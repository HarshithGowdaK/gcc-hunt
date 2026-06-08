export type ATSType = 'workday' | 'greenhouse' | 'lever' | 'smartrecruiters' | 'generic';

export function detectATS(url: string): ATSType {
  if (!url) return 'generic';
  
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('myworkdayjobs.com')) {
    return 'workday';
  }
  if (lowerUrl.includes('lever.co')) {
    return 'lever';
  }
  if (lowerUrl.includes('greenhouse.io') || lowerUrl.includes('boards.greenhouse.io')) {
    return 'greenhouse';
  }
  if (lowerUrl.includes('smartrecruiters.com')) {
    return 'smartrecruiters';
  }

  return 'generic';
}
