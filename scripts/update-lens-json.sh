#!/bin/bash

# Script to encode community-lens.js to base64 and update community-lens.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

JS_FILE="$PROJECT_DIR/community-lens.js"
JSON_FILE="$PROJECT_DIR/community-lens.json"

if [ ! -f "$JS_FILE" ]; then
    echo "Error: $JS_FILE not found"
    exit 1
fi

if [ ! -f "$JSON_FILE" ]; then
    echo "Error: $JSON_FILE not found"
    exit 1
fi

# Encode JS file to base64 (works on both macOS and Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    BASE64_CONTENT=$(base64 -i "$JS_FILE" | tr -d '\n')
else
    BASE64_CONTENT=$(base64 -w 0 "$JS_FILE")
fi

# Update the JSON file using node (more reliable than sed for JSON)
node -e "
const fs = require('fs');
const jsonFile = '$JSON_FILE';
const base64Content = \`$BASE64_CONTENT\`;

const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

// Update the data field in the content array
if (json.content && json.content[0]) {
    json.content[0].data = base64Content;
}

fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));
console.log('✅ Updated community-lens.json with encoded JS');
"

# Stage the updated JSON file
git add "$JSON_FILE"
