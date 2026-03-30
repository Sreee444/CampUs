const PROD_BASE_URL = 'https://campus-ai-server.onrender.com';
const rawEnvBaseUrl = String(process.env.EXPO_PUBLIC_AI_API_BASE_URL || '').trim();
const normalizedEnvBaseUrl = rawEnvBaseUrl
	// Fix common typo: http:///host -> http://host
	.replace(/^(https?:)\/\//i, '$1//')
	.replace(/\/+$/, '');

const getValidatedBaseUrl = (candidate: string) => {
	if (!candidate) return '';
	try {
		const parsed = new URL(candidate);
		if (!/^https?:$/i.test(parsed.protocol)) return '';
		if (!parsed.hostname) return '';
		return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
	} catch {
		return '';
	}
};

const configuredBaseUrl = getValidatedBaseUrl(normalizedEnvBaseUrl);

if (rawEnvBaseUrl && !configuredBaseUrl) {
	console.warn('Invalid EXPO_PUBLIC_AI_API_BASE_URL. Falling back to production API URL.');
}

export const BASE_URL = configuredBaseUrl || PROD_BASE_URL;
