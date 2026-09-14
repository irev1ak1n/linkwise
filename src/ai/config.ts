// The ONE place the LinkWise backend's URL is configured — never scattered as literal
// localhost strings throughout the extension. Deliberately NOT an environment variable baked
// in at build time: this is a plain runtime constant, so there is no Vite env-var mechanism
// here that could ever be mistaken for a place to put a secret. The OpenAI API key never
// belongs anywhere in the extension — see backend/.env.example for where it actually lives.
export const LINKWISE_API_BASE_URL = "http://localhost:8787";

export function analyzeProfileEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/analyze-profile`;
}

export function generateCriteriaEndpoint(): string {
  return `${LINKWISE_API_BASE_URL}/api/generate-criteria`;
}
