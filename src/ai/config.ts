// The one place the backend URL is configured. The OpenAI key never belongs in the extension,
// see backend/.env.example for where it lives.
export const LINKWISE_API_BASE_URL = "http://localhost:8787";

export function analyzeProfileEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/analyze-profile`;
}

export function generateCriteriaEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/generate-criteria`;
}
