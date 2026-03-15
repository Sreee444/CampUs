const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

function buildModelList() {
  const configuredModel = process.env.GROQ_MODEL;
  return [...new Set([configuredModel, ...FALLBACK_MODELS].filter(Boolean))];
}

function formatGroqError(error) {
  const providerMessage = error?.response?.data?.error?.message;
  const status = error?.response?.status;
  if (providerMessage && status) {
    return `Groq API ${status}: ${providerMessage}`;
  }
  if (providerMessage) {
    return `Groq API error: ${providerMessage}`;
  }
  return error?.message || 'Unknown Groq API error';
}

function isRetriableModelError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.error?.code;
  const message = (error?.response?.data?.error?.message || '').toLowerCase();
  return (
    status === 429 ||
    code === 'model_decommissioned' ||
    message.includes('decommissioned') ||
    message.includes('no longer supported') ||
    message.includes('rate limit') ||
    message.includes('tokens per day') ||
    message.includes('model') && message.includes('not found')
  );
}

async function getGroqCompletion(userPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is missing');
  }

  const models = buildModelList();
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const response = await axios.post(
        GROQ_URL,
        {
          model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise extraction engine. Return only valid JSON with no markdown and no extra text.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return response?.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      lastError = error;
      if (!isRetriableModelError(error) || index === models.length - 1) {
        break;
      }
      console.warn(`[groqService] model failed: ${model}. Trying next model...`, {
        status: error?.response?.status,
        code: error?.response?.data?.error?.code,
      });
    }
  }

  throw new Error(formatGroqError(lastError));
}

async function getChatCompletion(userPrompt, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is missing');
  }

  const models = buildModelList();
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const response = await axios.post(
        GROQ_URL,
        {
          model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: systemPrompt || 'You are a concise and helpful assistant.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return response?.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      lastError = error;
      if (!isRetriableModelError(error) || index === models.length - 1) {
        break;
      }
      console.warn(`[groqService] chat model failed: ${model}. Trying next model...`, {
        status: error?.response?.status,
        code: error?.response?.data?.error?.code,
      });
    }
  }

  throw new Error(formatGroqError(lastError));
}

module.exports = {
  getGroqCompletion,
  getChatCompletion,
};
