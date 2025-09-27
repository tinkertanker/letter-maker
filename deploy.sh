#!/bin/bash

# Deploy script for letter-maker
set -e

echo "🚀 Deploying Letter Maker to lettermaker.tk.sg..."

# Pull latest changes
echo "📦 Pulling latest changes from git..."
git pull origin main

# Build and restart containers
echo "🐳 Building Docker image..."
docker-compose build

echo "♻️  Restarting containers..."
docker-compose down
docker-compose up -d

echo "✅ Deployment complete!"
echo "🌐 Application should be available at https://lettermaker.tk.sg"
echo ""
echo "📝 Check logs with: docker-compose logs -f"
echo "🔍 Check status with: docker-compose ps"