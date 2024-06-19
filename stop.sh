#!/bin/bash

# Stop the Node.js server by killing the process running on port 5000
ss -tulpn | grep ":5000" | awk '{print $NF}' | cut -d',' -f2 | cut -d'=' -f2 | xargs kill -9

# Print a message to the console
echo "Server stopped"
