#!/bin/bash
# Open the Racho AI application in browser

echo -e "\033[1mRacho AI Assistant - Browser Launcher\033[0m"

# Check if server is running by trying to connect to the port
if (echo > /dev/tcp/localhost/3000) >/dev/null 2>&1; then
  echo -e "✅ \033[32mServer is already running\033[0m"
else
  echo -e "❌ \033[31mServer is not running\033[0m - Starting it now..."
  echo
  echo "Opening a new terminal window to run the server..."
  osascript -e 'tell application "Terminal" to do script "cd '$(pwd)' && node server.js"' > /dev/null
  echo "Waiting for server to start..."
  sleep 3
fi

# Open the application in the default browser
echo "Opening main application in default browser..."
open http://localhost:3000

echo
echo -e "\033[1mApplication Information:\033[0m"
echo "- Main App URL: http://localhost:3000"
echo "- Test Page: http://localhost:3000/test.html"
echo "- Debug Chat: http://localhost:3000/debug/simple-chat.html"
echo
echo -e "\033[1mTroubleshooting:\033[0m"
echo "1. If chat doesn't work, check that your OpenAI API key is valid in api/config.js"
echo "2. Use the debug chat page to test direct OpenAI integration"
echo "3. Check server logs in the terminal window"
echo
echo -e "\033[1mDocumentation:\033[0m"
echo "See README.md for detailed setup and usage instructions"