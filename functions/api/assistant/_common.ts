/**
 * OpenAI API 공통 호출 함수
 * Gemini에서 OpenAI로 전환
 */

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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
