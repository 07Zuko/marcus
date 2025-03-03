const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const config = require('../config');

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: config.PINECONE_API_KEY,
  environment: config.PINECONE_ENVIRONMENT
});

// Get index
const index = pinecone.index(config.PINECONE_INDEX);

// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY
});

/**
 * Create embeddings using OpenAI's embeddings API
 * @param {string} text - Text to create embeddings for
 * @returns {Array} - Embedding vector
 */
const createEmbedding = async (text) => {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw new Error(`Embedding creation error: ${error.message}`);
  }
};

/**
 * Store a memory in Pinecone
 * @param {Object} memory - Memory object to store
 * @param {string} userId - User ID
 */
exports.storeMemory = async (memory, userId) => {
  try {
    // Create metadata
    const metadata = {
      userId,
      timestamp: new Date().toISOString(),
      type: memory.type, // 'chat', 'goal', 'task', 'log', etc.
      ...memory.metadata
    };
    
    // Create text for embedding
    const textForEmbedding = memory.text || memory.content || JSON.stringify(memory);
    
    // Generate embedding vector
    const embedding = await createEmbedding(textForEmbedding);
    
    // Store in Pinecone
    await index.upsert([{
      id: memory.id || `${userId}-${Date.now()}`,
      values: embedding,
      metadata
    }]);
    
    return { success: true };
  } catch (error) {
    console.error('Error storing memory in Pinecone:', error);
    throw new Error(`Memory storage error: ${error.message}`);
  }
};

/**
 * Query memories from Pinecone
 * @param {string} query - Query text
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Array} - Relevant memories
 */
exports.queryMemories = async (query, userId, options = {}) => {
  try {
    // Generate embedding for query
    const queryEmbedding = await createEmbedding(query);
    
    // Default options
    const { limit = 5, filter = {}, includeMetadata = true } = options;
    
    // Build filter
    const fullFilter = {
      userId,
      ...filter
    };
    
    // Query Pinecone
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      filter: fullFilter,
      includeMetadata
    });
    
    return queryResponse.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    }));
  } catch (error) {
    console.error('Error querying memories from Pinecone:', error);
    throw new Error(`Memory query error: ${error.message}`);
  }
};

/**
 * Delete memories from Pinecone
 * @param {Array} ids - Array of memory IDs to delete
 * @returns {Object} - Operation result
 */
exports.deleteMemories = async (ids) => {
  try {
    await index.deleteMany(ids);
    return { success: true, count: ids.length };
  } catch (error) {
    console.error('Error deleting memories from Pinecone:', error);
    throw new Error(`Memory deletion error: ${error.message}`);
  }
};

/**
 * Store chat message in Pinecone
 * @param {Object} message - Chat message
 * @param {string} userId - User ID
 * @param {string} sessionId - Chat session ID
 */
exports.storeChatMemory = async (message, userId, sessionId) => {
  try {
    const memory = {
      id: `chat-${sessionId}-${Date.now()}`,
      type: 'chat',
      text: message.content,
      metadata: {
        role: message.role,
        sessionId,
        timestamp: new Date().toISOString()
      }
    };
    
    return await exports.storeMemory(memory, userId);
  } catch (error) {
    console.error('Error storing chat memory:', error);
    throw new Error(`Chat memory storage error: ${error.message}`);
  }
};

/**
 * Query relevant memories for chat context
 * @param {string} query - User's message
 * @param {string} userId - User ID
 * @returns {Array} - Relevant memories
 */
exports.getRelevantMemories = async (query, userId) => {
  try {
    return await exports.queryMemories(query, userId, {
      limit: 10,
      includeMetadata: true
    });
  } catch (error) {
    console.error('Error getting relevant memories:', error);
    return [];
  }
};

module.exports = exports;