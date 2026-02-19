/**
 * OpenAI API 공통 호출 함수 (Cloudflare AI Gateway 경유)
 * HKG colo에서 OpenAI 직접 호출 시 홍콩 IP로 인식되어 403 차단됨
 * AI Gateway를 통해 US 라우팅으로 해결
 */

const OPENAI_BASE_URL = 'https://gateway.ai.cloudflare.com/v1/3d0681b782422e56226a0a1df4a0e8b2/travly-ai-gateway/openai';

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string; // base64 data URL or http URL
    detail?: 'low' | 'high' | 'auto';
  };
}

export async function callOpenAI(
  apiKey: string, 
  messages: OpenAIMessage[], 
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
  } = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2000, responseFormat = 'text' } = options;

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat === 'json_object' && { response_format: { type: 'json_object' } }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content;
}

/**
 * OpenAI Vision API 호출 (이미지 포함)
 * gpt-4o-mini는 vision도 지원
 */
export async function callOpenAIWithVision(
  apiKey: string, 
  messages: OpenAIMessage[], 
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
  } = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2000, responseFormat = 'text' } = options;

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // gpt-4o-mini supports vision
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat === 'json_object' && { response_format: { type: 'json_object' } }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI Vision API error:', response.status, errorText);
    throw new Error(`OpenAI Vision ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content;
}

/**
 * Gemini 포맷을 OpenAI 메시지 포맷으로 변환
 * 기존 코드와의 호환성을 위한 헬퍼
 */
export function convertGeminiToOpenAI(contents: any[]): OpenAIMessage[] {
  return contents.map(item => ({
    role: item.role === 'model' ? 'assistant' : item.role as 'user' | 'system',
    content: item.parts?.map((p: any) => p.text).join('') || '',
  }));
}

/**
 * 기존 callGemini 호환 래퍼 (점진적 마이그레이션용)
 */
export async function callGemini(apiKey: string, contents: any[], generationConfig: any): Promise<string> {
  const messages = convertGeminiToOpenAI(contents);
  
  return callOpenAI(apiKey, messages, {
    temperature: generationConfig.temperature || 0.7,
    maxTokens: generationConfig.maxOutputTokens || 2000,
    responseFormat: generationConfig.response_mime_type === 'application/json' ? 'json_object' : 'text',
  });
}
