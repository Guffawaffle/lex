#!/bin/bash
set -e

# Copy canon assets to package directories for npm publishing
echo "Copying canon assets to package directories..."

# Remove old build artifacts
rm -rf prompts schemas

# Copy canon to package directories
cp -r canon/prompts prompts
cp -r canon/schemas schemas

echo "Canon assets copied successfully."
