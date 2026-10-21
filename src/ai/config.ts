// The one place the backend URL is configured. The OpenAI key never belongs in the extension,
// see backend/.env.example for where it lives.
export const LINKWISE_API_BASE_URL = "http://localhost:8787";

export function analyzeProfileEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/analyze-profile`;
}

export function generateCriteriaEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/generate-criteria`;
}

export function analyzeSignalsEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/analyze-signals`;
}

export function optimizeProfileEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimize-profile`;
}

export function optimizerDraftEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimizer-draft`;
}

export function optimizerSectionEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimizer-section`;
}

export function optimizerChecklistEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimizer-checklist`;
}

export function compareProfileEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/compare-profile`;
}

export function optimizerHeadlinesEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimizer-headlines`;
}

export function optimizerAboutsEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/optimizer-abouts`;
}
