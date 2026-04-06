#!/bin/bash

# Deploy script for Ubuntu Server
# Usage: ./deploy.sh [your-dockerhub-username]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get Docker Hub username
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide your Docker Hub username${NC}"
    echo "Usage: ./deploy.sh your-dockerhub-username"
    exit 1
fi

USERNAME=$1

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LooksmaxTN Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Update docker-compose.yml with the username
echo -e "${GREEN}Updating docker-compose.yml with username: $USERNAME${NC}"
sed -i.bak "s|yourusername|${USERNAME}|g" docker-compose.prod.yml
rm docker-compose.prod.yml.bak

echo -e "${GREEN}✓ docker-compose.yml updated${NC}"
echo ""

# Create environment directories
echo -e "${GREEN}Creating environment directories...${NC}"
mkdir -p env/back env/admin env/front
echo -e "${GREEN}✓ Environment directories created${NC}"
echo ""

# Check if environment files exist
echo -e "${YELLOW}Checking environment files...${NC}"

if [ ! -f "env/back/.env" ]; then
    echo -e "${RED}⚠ Backend environment file not found${NC}"
    echo -e "${YELLOW}Please create env/back/.env with your production variables${NC}"
    echo ""
    echo "Example content:"
    cat << 'EOF'
MONGODB_URI=mongodb://localhost:27017/looksmax-production
BACKEND_BASE_URL=https://yourdomain.com
FRONTEND_BASE_URL=https://yourdomain.com
PRODUCT_GENERATION_URL_BASE=http://localhost:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://localhost:8000
OUTFIT_WEBHOOK_BASE_URL=https://yourdomain.com
OUTFIT_WEBHOOK_SECRET=your-secret-webhook-key-here
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
EOF
    echo ""
    exit 1
fi

if [ ! -f "env/admin/.env" ]; then
    echo -e "${RED}⚠ Admin environment file not found${NC}"
    echo -e "${YELLOW}Please create env/admin/.env with your production variables${NC}"
    echo ""
    echo "Example content:"
    cat << 'EOF'
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
EOF
    echo ""
    exit 1
fi

if [ ! -f "env/front/.env" ]; then
    echo -e "${RED}⚠ Frontend environment file not found${NC}"
    echo -e "${YELLOW}Please create env/front/.env with your production variables${NC}"
    echo ""
    echo "Example content:"
    cat << 'EOF'
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_URL=https://admin.yourdomain.com
NODE_ENV=production
EOF
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ All environment files found${NC}"
echo ""

# Pull images
echo -e "${GREEN}Pulling Docker images...${NC}"
docker-compose -f docker-compose.prod.yml pull
echo -e "${GREEN}✓ Images pulled successfully${NC}"
echo ""

# Start services
echo -e "${GREEN}Starting services...${NC}"
docker-compose -f docker-compose.prod.yml up -d
echo -e "${GREEN}✓ Services started successfully${NC}"
echo ""

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Show status
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Container Status${NC}"
echo -e "${BLUE}========================================${NC}"
docker-compose -f docker-compose.prod.yml ps
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your applications are now running:"
echo "  - Frontend: http://localhost:3000"
echo "  - Admin:    http://localhost:3003"
echo "  - Backend:  http://localhost:3004"
echo "  - MongoDB:  localhost:27017"
echo ""
echo "View logs with: docker-compose -f docker-compose.prod.yml logs -f"
