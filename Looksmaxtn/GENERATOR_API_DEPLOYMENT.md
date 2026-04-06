# 🐍 Generator API Deployment Guide

## 📋 Overview

The `generator_api` is a Python FastAPI service that handles AI-powered fashion image generation using Google Gemini. It runs **separately** from the main 3 projects (front, admin, back) and needs its own Docker Compose deployment.

## 🚀 Deployment Steps

### **Phase 1: Local Setup**

#### 1.1 Configure Generator API Environment
```bash
cd generator_api

# Create production environment file
cp .env.production.template .env.production

# Edit the file
nano .env.production
```

#### 1.2 Required Environment Variables
```env
# Required - Get your Google API Key from: https://console.cloud.google.com/
GOOGLE_API_KEY=your_actual_google_api_key_here

# Optional - Environment
ENVIRONMENT=production

# Optional - If your API needs to call webhooks
WEBHOOK_SECRET=your-webhook-secret-if-needed
```

#### 1.3 Build and Push to Docker Hub
```bash
# Make script executable (first time only)
chmod +x build-push.sh

# Build and push image
./build-push.sh your-dockerhub-username
```

### **Phase 2: Server Setup**

#### 2.1 SSH to Your Server
```bash
ssh user@your-server-ip
```

#### 2.2 Create Generator API Directory
```bash
sudo mkdir -p /var/www/looksmax-generator
sudo chown $USER:$USER /var/www/looksmax-generator
cd /var/www/looksmax-generator
```

#### 2.3 Copy Files to Server
```bash
# From your local machine
scp -r generator_api/docker-compose.prod.yml generator_api/.env.production user@your-server-ip:/var/www/looksmax-generator/
```

#### 2.4 Create Environment File on Server
```bash
cd /var/www/looksmax-generator

# Create environment file
nano .env
```

Paste your generator API environment variables:
```env
GOOGLE_API_KEY=your_actual_google_api_key_here
ENVIRONMENT=production
```

#### 2.5 Update Docker Compose Username
```bash
# Update the docker-compose.prod.yml with your Docker Hub username
sed -i 's/yourusername/your-dockerhub-username/g' docker-compose.prod.yml
```

#### 2.6 Deploy Generator API
```bash
# Pull and start the service
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### **Phase 3: Update Main Projects Configuration**

#### 3.1 Update Backend Environment
```bash
cd /var/www/looksmax  # main projects directory

# Edit backend environment
nano env/back/.env
```

**Update these variables:**
```env
# If generator API is on same server:
PRODUCT_GENERATION_URL_BASE=http://localhost:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://localhost:8000

# If generator API is on different server:
PRODUCT_GENERATION_URL_BASE=http://your-generator-server-ip:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://your-generator-server-ip:8000

# If using domain:
PRODUCT_GENERATION_URL_BASE=https://generator.yourdomain.com/
ADMIN_IMAGE_GENERATION_URL_BASE=https://generator.yourdomain.com
```

#### 3.2 Restart Backend Service
```bash
cd /var/www/looksmax
docker-compose -f docker-compose.prod.yml restart back
```

## 🔧 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Production Server                      │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Main Projects (Port 3000-3004)      │    │
│  │  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │   Frontend   │  │    Admin     │             │    │
│  │  │   :3000      │  │   :3003      │             │    │
│  │  └──────────────┘  └──────────────┘             │    │
│  │  ┌─────────────────────────────────────┐         │    │
│  │  │         Backend API                 │         │    │
│  │  │         :3004                        │         │    │
│  │  │  Calls Generator API at port 8000   │         │    │
│  │  └─────────────────────────────────────┘         │    │
│  │  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │   MongoDB    │  │   Redis?     │             │    │
│  │  │   :27017     │  │   :6379      │             │    │
│  │  └──────────────┘  └──────────────┘             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Generator API (Port 8000)              │    │
│  │  Separate Docker Compose                         │    │
│  │  - FastAPI Service                               │    │
│  │  - Google Gemini Integration                     │    │
│  │  - Image Generation                              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## 📝 Environment Variables Summary

### **Generator API** (`.env`):
- `GOOGLE_API_KEY` (Required) - Your Google Cloud API key
- `ENVIRONMENT` (Optional) - Set to `production`
- `WEBHOOK_SECRET` (Optional) - If webhook callbacks needed

### **Backend API** (Still Requires):
- ✅ **`JWT_SECRET`** - For admin authentication (KEEP!)
- ✅ **`OUTFIT_WEBHOOK_SECRET`** - For webhook security (KEEP!)
- `PRODUCT_GENERATION_URL_BASE` - Points to generator API
- `ADMIN_IMAGE_GENERATION_URL_BASE` - Points to generator API

## 🔄 Complete Deployment Workflow

### **When Updating Generator API:**

```bash
# 1. Local - Make changes and build
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn/generator_api
./build-push.sh your-dockerhub-username

# 2. Server - Deploy generator API
ssh user@your-server-ip
cd /var/www/looksmax-generator
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# 3. Test the API
curl http://localhost:8000/health
```

### **When Updating Main Projects:**

```bash
# 1. Local - Build and push main projects
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn
./build-push.sh your-dockerhub-username

# 2. Server - Deploy main projects
ssh user@your-server-ip
cd /var/www/looksmax
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

## 🔍 Testing

### **Test Generator API:**
```bash
# Health check
curl http://your-server-ip:8000/health

# Check API info
curl http://your-server-ip:8000/
```

### **Test Backend Connection to Generator:**
```bash
# From backend container
docker exec -it looksmax-back sh
curl http://your-generator-server-ip:8000/health
exit
```

### **Test Webhook (if configured):**
```bash
curl -X POST http://your-domain.com/api/store/generate-outfit/webhook \
  -H "x-webhook-secret: your-webhook-secret" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "test-job-id"}'
```

## 🚨 Troubleshooting

### **Generator API Won't Start:**
```bash
# Check logs
docker-compose -f /var/www/looksmax-generator/docker-compose.prod.yml logs -f

# Check if port 8000 is available
sudo netstat -tulpn | grep :8000

# Test Google API key locally
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models
```

### **Backend Can't Connect to Generator:**
```bash
# Check if generator is running
docker ps | grep generator

# Test connectivity from backend container
docker exec -it looksmax-back ping your-generator-server-ip
docker exec -it looksmax-back curl http://your-generator-server-ip:8000/health

# Check firewall rules
sudo ufw status
```

### **Environment Variables Not Loading:**
```bash
# Verify environment file exists
ls -la /var/www/looksmax-generator/.env

# Check container environment
docker exec looksmax-generator-api env | grep GOOGLE

# Restart with clean environment
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## 🎯 URLs After Deployment

- **Generator API**: `http://localhost:8000` or `https://generator.yourdomain.com`
- **Frontend**: `http://localhost:3000` or `https://yourdomain.com`
- **Admin**: `http://localhost:3003` or `https://admin.yourdomain.com`
- **Backend**: `http://localhost:3004/api` or `https://yourdomain.com/api`

## 📊 Monitoring

### **Generator API Monitoring:**
```bash
# Check container status
docker ps | grep generator

# View resource usage
docker stats looksmax-generator-api

# View logs
docker logs -f looksmax-generator-api
```

### **Main Projects Monitoring:**
```bash
cd /var/www/looksmax
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

## 🎉 Complete!

Your generator API is now ready for separate deployment! Remember:

- ✅ **Keep `JWT_SECRET`** - Used for admin authentication
- ✅ **Keep `OUTFIT_WEBHOOK_SECRET`** - Used for webhook security
- ✅ **Point `PRODUCT_GENERATION_URL_BASE` and `ADMIN_IMAGE_GENERATION_URL_BASE`** to your generator API URL
- ✅ **Deploy generator API separately** using its own docker-compose.prod.yml
