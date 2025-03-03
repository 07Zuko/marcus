#!/bin/bash
# Debug and test script for Racho AI

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Print colorful header
print_header() {
  echo -e "\033[1;34m"
  echo "======================================="
  echo "   Racho AI - Debug & Test Utility"
  echo "======================================="
  echo -e "\033[0m"
}

# Print section header
print_section() {
  echo
  echo -e "\033[1;36m$1\033[0m"
  echo -e "\033[0;36m${2:-$(printf '=%.0s' $(seq 1 ${#1}))}\033[0m"
}

# Main script starts here
print_header

print_section "CHECKING SERVER STATUS"
# Check if server is running by trying to connect to the port
if nc -z localhost 3000 2>/dev/null || (command_exists bash && (echo > /dev/tcp/localhost/3000) >/dev/null 2>&1); then
  echo -e "✅ \033[32mServer is already running on port 3000\033[0m"
  SERVER_RUNNING=true
else
  echo -e "❌ \033[31mServer is not running\033[0m"
  echo
  echo "Would you like to start the server now? (y/n)"
  read -r start_server
  if [[ "$start_server" =~ ^[Yy]$ ]]; then
    echo "Starting server in a new terminal window..."
    if command_exists osascript; then
      # macOS approach
      osascript -e 'tell application "Terminal" to do script "cd '$(pwd)' && node server.js"' > /dev/null
    else
      # Linux/other approach - try using x-terminal-emulator if available
      if command_exists x-terminal-emulator; then
        x-terminal-emulator -e "cd $(pwd) && node server.js" &
      else
        echo -e "\033[31mCouldn't automatically start server in a new terminal.\033[0m"
        echo "Please open a new terminal window and run:"
        echo -e "\033[1mcd $(pwd) && node server.js\033[0m"
        read -p "Press enter when you've started the server..."
      fi
    fi
    echo "Waiting for server to start..."
    sleep 3
    SERVER_RUNNING=true
  else
    SERVER_RUNNING=false
    echo "Skipping server start. Some tests may fail."
  fi
fi

if [ "$SERVER_RUNNING" = true ]; then
  print_section "TESTING OPTIONS"
  echo "What would you like to do?"
  echo
  echo "1) Run comprehensive diagnostic tests"
  echo "2) Open simple chat tester"
  echo "3) Open advanced API debugger"
  echo "4) Open main application"
  echo "5) Exit"
  echo
  read -p "Enter your choice [1-5]: " choice
  echo

  case $choice in
    1)
      echo "Running diagnostic tests..."
      # First check the API connection
      echo "Testing API connection..."
      if command_exists curl; then
        curl -s http://localhost:3000/api/test > /dev/null
        if [ $? -eq 0 ]; then
          echo -e "✅ \033[32mAPI connection successful\033[0m"
        else
          echo -e "❌ \033[31mAPI connection failed\033[0m"
        fi
      else
        # Try using node for the test
        node -e "const http = require('http'); const req = http.request({hostname: 'localhost', port: 3000, path: '/api/test', method: 'GET'}, (res) => { console.log('\x1b[32m✅ API connection successful\x1b[0m'); process.exit(0); }); req.on('error', () => { console.log('\x1b[31m❌ API connection failed\x1b[0m'); process.exit(1); }); req.end();"
      fi
      
      # Open both test pages for visual inspection
      echo "Opening diagnostic tools for detailed testing..."
      sleep 1
      if command_exists open; then
        open http://localhost:3000/debug/openai-test.html
      elif command_exists xdg-open; then
        xdg-open http://localhost:3000/debug/openai-test.html
      else
        echo "Please manually open http://localhost:3000/debug/openai-test.html in your browser"
      fi
      ;;
    2)
      echo "Opening simple chat tester..."
      if command_exists open; then
        open http://localhost:3000/debug/simple-chat.html
      elif command_exists xdg-open; then
        xdg-open http://localhost:3000/debug/simple-chat.html
      else
        echo "Please manually open http://localhost:3000/debug/simple-chat.html in your browser"
      fi
      ;;
    3)
      echo "Opening advanced API debugger..."
      if command_exists open; then
        open http://localhost:3000/debug/openai-test.html
      elif command_exists xdg-open; then
        xdg-open http://localhost:3000/debug/openai-test.html
      else
        echo "Please manually open http://localhost:3000/debug/openai-test.html in your browser"
      fi
      ;;
    4)
      echo "Opening main application..."
      if command_exists open; then
        open http://localhost:3000
      elif command_exists xdg-open; then
        xdg-open http://localhost:3000
      else
        echo "Please manually open http://localhost:3000 in your browser"
      fi
      ;;
    5)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo "Invalid choice. Exiting..."
      exit 1
      ;;
  esac
fi

print_section "HELP & TROUBLESHOOTING"
echo "• If you see HTML errors instead of JSON responses, the server isn't running correctly"
echo "• Using the debug tools will help identify if it's an OpenAI API key issue"
echo "• The app will use fallback responses without a valid OpenAI API key"
echo "• To use real OpenAI responses, edit api/config.js with a valid API key"
echo "• For MongoDB issues, make sure MongoDB is running and accessible"

echo
echo -e "\033[1mDebug Test URLs:\033[0m"
echo "- Simple Chat Tester: http://localhost:3000/debug/simple-chat.html"
echo "- OpenAI API Debugger: http://localhost:3000/debug/openai-test.html"
echo "- Main Application: http://localhost:3000"

echo
echo -e "\033[1;34mDone!\033[0m"