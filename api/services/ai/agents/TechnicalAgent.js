/**
 * Technical Agent
 * 
 * Specialized AI agent for handling programming and technical
 * questions, with direct access to Claude Code for implementation.
 */

const BaseAgent = require('./BaseAgent');

class TechnicalAgent extends BaseAgent {
  /**
   * Create a new Technical Agent
   * @param {OpenAI} openai - OpenAI instance
   * @param {Object} claudeCodeImplementer - Claude Code implementation tool
   */
  constructor(openai, claudeCodeImplementer) {
    super('TechnicalAgent', openai, claudeCodeImplementer);
    
    // System prompt for technical assistance
    this.systemPrompt = `
      You are Marcus's Technical Advisor, a specialized AI focused on programming and technical assistance.
      
      Your primary responsibilities:
      1. Help with technical questions and programming concepts
      2. Explain code and technical ideas in simple terms
      3. Provide code examples when helpful
      4. Suggest technical solutions for health & fitness tracking
      
      Key principles:
      - Provide accurate, clear technical explanations
      - Adapt explanations to the user's technical level
      - Use analogies to explain complex concepts
      - Offer practical, implementable advice
      
      Your tone should be:
      - Clear and precise
      - Helpful and patient
      - Conversational but authoritative
      - Not overly technical or jargon-heavy
      
      When explaining technical concepts:
      - Start with the big picture
      - Use concrete examples
      - Break down complex ideas into simpler parts
      - Connect to real-world applications
    `;
  }
  
  /**
   * Process a technical conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId, analysis) {
    this.debug('Processing technical conversation');
    
    try {
      // Create custom prompt with more specific technical context
      const customPrompt = this.createTechnicalContextPrompt(analysis);
      
      // Get completion from AI
      const messageSet = this.createMessageSet(messages, customPrompt);
      const completion = await this.getCompletion(messageSet, {
        temperature: 0.5, // Slightly lower temperature for more precise answers
        max_tokens: 800  // Allow longer responses for technical explanations
      });
      
      return {
        message: completion.choices[0].message,
        model: completion.model,
        usage: completion.usage,
        agent: this.name
      };
    } catch (error) {
      console.error('Error in TechnicalAgent:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having trouble processing your technical question. Could you try rephrasing it? I'm here to help with programming and technical concepts."
        },
        model: 'error-fallback',
        agent: this.name
      };
    }
  }
  
  /**
   * Create a technical context prompt
   * @param {Object} analysis - Conversation analysis
   * @returns {string} - Technical context prompt
   */
  createTechnicalContextPrompt(analysis) {
    let contextPrompt = this.systemPrompt;
    
    // Enhance based on the analysis
    if (analysis && analysis.primaryIntent) {
      contextPrompt += `\n\nThe user seems to be asking about: ${analysis.primaryIntent}`;
      
      // Add domain-specific context based on intent
      if (analysis.primaryIntent.includes('fitness tracking') || 
          analysis.primaryIntent.includes('workout app')) {
        contextPrompt += `\n\nThis question relates to fitness tracking technology. 
        When responding, consider:
        - How technology can help track and improve fitness performance
        - Common metrics in fitness tracking (heart rate, steps, weights, etc.)
        - Best practices for storing and analyzing fitness data
        - Privacy considerations for health/fitness data`;
      } 
      else if (analysis.primaryIntent.includes('code') || 
               analysis.primaryIntent.includes('programming')) {
        contextPrompt += `\n\nThis is a programming or code-related question.
        Focus on clear explanations with:
        - Simple code examples when helpful
        - Explanations of concepts in plain language
        - Best practices and common pitfalls`;
      }
    }
    
    return contextPrompt;
  }
}

module.exports = TechnicalAgent;