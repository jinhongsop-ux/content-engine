import { split, buildContinuationPrompt } from './splitter.js';

const DEFAULT_CONFIG = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8000,
  maxRetries: 2,
  timeoutMs: 180_000,
  maxContinuations: 2,
};

export async function generate(systemPrompt, userPrompt, apiConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...apiConfig };
  let lastError = null;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await runWithContinuation(systemPrompt, userPrompt, cfg);
    } catch (err) {
      lastError = err;
      if (attempt < cfg.maxRetries) await sleep(attempt * 2000);
    }
  }

  return {
    html: null,
    meta: null,
    complete: false,
    rawOutput: '',
    tokenCount: 0,
    warnings: [],
    error: `All ${cfg.maxRetries} attempts failed. Last error: ${lastError?.message || 'unknown error'}`,
  };
}

async function runWithContinuation(systemPrompt, userPrompt, cfg) {
  const messages = [{ role: 'user', content: userPrompt }];
  let rawOutput = '';
  let tokenCount = 0;

  for (let continuation = 0; continuation <= cfg.maxContinuations; continuation++) {
    const response = await callAPI(systemPrompt, messages, cfg);
    rawOutput += response.text;
    tokenCount += response.usage?.output_tokens || response.usage?.completion_tokens || 0;
    messages.push({ role: 'assistant', content: response.text });

    const splitResult = split(rawOutput);
    if (splitResult.complete) {
      return { ...splitResult, rawOutput, tokenCount, error: null };
    }

    if (!splitResult.truncated || continuation === cfg.maxContinuations) {
      return { ...splitResult, rawOutput, tokenCount };
    }

    messages.push({ role: 'user', content: buildContinuationPrompt(splitResult.html || rawOutput) });
  }
}

async function callAPI(systemPrompt, messages, cfg) {
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('No API key found. Set ANTHROPIC_API_KEY or enter a key in the UI.');

  const endpoint = normalizeEndpoint(cfg.endpoint || DEFAULT_CONFIG.endpoint);
  const isAnthropic = endpoint.includes('anthropic.com') || endpoint.includes('/anthropic');
  const isXiaomi = endpoint.includes('xiaomimimo.com');
  const headers = { 'Content-Type': 'application/json' };
  let body;

  if (isAnthropic) {
    if (isXiaomi) headers.Authorization = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: systemPrompt,
      messages,
    };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const text =
    data.content?.map(part => part.text || '').join('') ||
    data.choices?.[0]?.message?.content ||
    data.output_text ||
    data.text ||
    '';

  if (!text.trim()) throw new Error(`Empty response from API: ${JSON.stringify(data).slice(0, 500)}`);
  return { text, usage: data.usage || {} };
}

function normalizeEndpoint(endpoint) {
  const raw = String(endpoint || '').replace(/\/+$/, '');
  if (/\/anthropic$/i.test(raw)) return `${raw}/v1/messages`;
  if (/\/anthropic\/v1$/i.test(raw)) return `${raw}/messages`;
  if (/\/v1$/i.test(raw)) return `${raw}/chat/completions`;
  return raw;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
