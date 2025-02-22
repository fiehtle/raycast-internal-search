"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmService = exports.AnthropicService = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const api_1 = require("@raycast/api");
// Initialize Anthropic client
const preferences = (0, api_1.getPreferenceValues)();
const anthropic = new sdk_1.default({
    apiKey: preferences.anthropicApiKey,
});
class AnthropicService {
    constructor() { }
    static getInstance() {
        if (!AnthropicService.instance) {
            AnthropicService.instance = new AnthropicService();
        }
        return AnthropicService.instance;
    }
    async classifyIntent(query) {
        try {
            const message = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                messages: [{
                        role: "user",
                        content: `Classify the following search query intent. The query is: "${query}"
          
          Determine if the user wants to:
          1. Find specific documents (intent: FIND_DOCUMENT)
          2. Get answers or information from document content (intent: ANSWER_QUESTION)
          
          Respond in JSON format with:
          - intent: either "FIND_DOCUMENT" or "ANSWER_QUESTION"
          - confidence: number between 0 and 1
          - explanation: brief explanation of why this intent was chosen`
                    }],
                temperature: 0.1
            });
            // Get the response content
            const content = message.content[0].type === 'text'
                ? message.content[0].text
                : '';
            return JSON.parse(content);
        }
        catch (error) {
            console.error('Error classifying intent:', error);
            throw new Error('Failed to classify search intent');
        }
    }
    async generateAnswer(query, context) {
        try {
            const message = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                messages: [{
                        role: "user",
                        content: `Based on the following content from relevant files, please answer this question: "${query}"

Content:
${context}

Please provide a clear and concise answer based only on the information found in the content above. If the content doesn't contain enough information to answer the question fully, please mention that in your response.`
                    }],
                temperature: 0.1
            });
            return message.content[0].type === 'text'
                ? message.content[0].text
                : 'Unable to generate answer';
        }
        catch (error) {
            console.error('Error generating answer:', error);
            throw new Error('Failed to generate answer');
        }
    }
}
exports.AnthropicService = AnthropicService;
exports.llmService = AnthropicService.getInstance();
