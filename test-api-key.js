// Simple script to test if the OpenAI API key works

const config = require('./api/config');
const OpenAI = require('openai');

async function testOpenAI() {
  console.log('Testing OpenAI API with key:', config.OPENAI_API_KEY.substring(0, 10) + '...');
  
  try {
    const openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY
    });
    
    console.log('Making request to OpenAI API...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello world' }
      ],
      max_tokens: 100
    });
    
    console.log('SUCCESS! Response received from OpenAI:');
    console.log(completion.choices[0].message.content);
    return true;
  } catch (error) {
    console.error('ERROR with OpenAI API:');
    console.error(error.message);
    
    // Try our fallback implementation
    console.log('\nTesting fallback response system...');
    const message = "Hello world";
    
    function fallbackResponse(msg) {
      return "This is a fallback response to your message: " + msg + 
             "\nThe OpenAI API call failed, but the application can still function with local responses.";
    }
    
    const response = fallbackResponse(message);
    console.log('\nFallback response:');
    console.log(response);
    
    return false;
  }
}

// Run the test
testOpenAI()
  .then(success => {
    console.log('\nTest completed.');
    console.log(success ? 'The OpenAI API key is working correctly.' : 'The OpenAI API key is NOT working, but fallback is available.');
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
  });