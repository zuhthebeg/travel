interface Env {
  GEMINI_API_KEY: string;
}

export async function callGemini(apiKey: string, contents: any[], generationConfig: any) {
  const models = ['gemini-2.5-flash', 'gemini-1.5-pro-latest'];
  let lastError: any = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      }

      if (response.status === 503) {
        console.warn(`Model ${model} is overloaded, trying next model...`);
        lastError = new Error(`Gemini API request failed with status ${response.status}`);
        continue;
      }

      const errorText = await response.text();
      console.error(`Gemini API error with model ${model}:`, errorText);
      lastError = new Error(`Gemini API request failed with status ${response.status}`);
      break;

    } catch (error) {
      console.error(`Failed to call Gemini API with model ${model}:`, error);
      lastError = error;
    }
  }

  console.error('All Gemini models failed:', lastError);
  throw new Error('Failed to get response from AI assistant');
}
