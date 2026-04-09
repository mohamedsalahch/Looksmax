#!/bin/bash

# Build and Push Generator API Docker Image to Docker Hub
# Usage: ./build-push.sh [your-dockerhub-username]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get Docker Hub username
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide your Docker Hub username${NC}"
    echo "Usage: ./build-push.sh your-dockerhub-username"
    exit 1
fi

USERNAME=$1
VERSION=${2:-latest}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Generator API Docker Build & Push${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if user is logged in to Docker Hub
echo -e "${GREEN}Checking Docker Hub login status...${NC}"
if ! docker info | grep -q "Username"; then
    echo -e "${RED}Not logged in to Docker Hub. Please login first:${NC}"
    echo "docker login"
    exit 1
fi
echo -e "${GREEN}✓ Logged in as $USERNAME${NC}"
echo ""

# Build the image
echo -e "${BLUE}Building Generator API...${NC}"
docker build -t "${USERNAME}/looksmax-generator-api:${VERSION}" .

# Push the image
echo -e "${BLUE}Pushing Generator API...${NC}"
docker push "${USERNAME}/looksmax-generator-api:${VERSION}"

echo -e "${GREEN}✓ Generator API built and pushed successfully${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Generator API deployment ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Image pushed as: ${USERNAME}/looksmax-generator-api:${VERSION}"
echo ""
echo "Next steps:"
echo "1. SSH to your server: ssh user@your-server-ip"
echo "2. Deploy: docker-compose -f docker-compose.prod.yml up -d"
echo "3. Update backend .env to point to your generator API URL"
