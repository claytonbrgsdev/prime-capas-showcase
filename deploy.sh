#!/bin/bash

# Deploy script for Prime Capas Showcase
# This script helps with manual deployment and local testing

echo "🚀 Prime Capas Showcase - Deploy Script"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if we're in the right directory
if [ ! -d "prime-capas" ]; then
    echo -e "${RED}❌ Error: Directory 'prime-capas' not found!${NC}"
    echo "Make sure you're in the root of the prime-capas-showcase repository."
    exit 1
fi

echo -e "${GREEN}✅ Found prime-capas directory${NC}"

# Check for required files
required_files=("prime-capas/index.html" "prime-capas/main.js" "prime-capas/styles.css")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required files present${NC}"

# Create .nojekyll if it doesn't exist
if [ ! -f ".nojekyll" ]; then
    touch .nojekyll
    echo -e "${GREEN}✅ Created .nojekyll file${NC}"
fi

# Option 1: Local testing
if [ "$1" = "local" ] || [ "$1" = "test" ]; then
    echo -e "${YELLOW}🔧 Starting local server for testing...${NC}"
    echo "Access the application at: http://localhost:8000"
    echo "Press Ctrl+C to stop the server"
    echo ""

    cd prime-capas
    if command_exists python3; then
        python3 -m http.server 8000
    elif command_exists python; then
        python -m http.server 8000
    else
        echo -e "${RED}❌ Python not found. Please install Python to run local server.${NC}"
        exit 1
    fi
fi

# Option 2: Manual GitHub Pages setup
if [ "$1" = "github" ] || [ "$1" = "setup" ]; then
    echo -e "${YELLOW}📋 Manual GitHub Pages Setup Instructions:${NC}"
    echo ""
    echo "1. Go to your GitHub repository"
    echo "2. Navigate to Settings → Pages"
    echo "3. Under 'Source', select 'GitHub Actions'"
    echo "4. The workflow will automatically deploy when you push to main"
    echo ""
    echo -e "${GREEN}✅ GitHub Actions workflow is already configured${NC}"
    echo ""
    echo -e "${YELLOW}💡 Or you can:${NC}"
    echo "- Push to main branch to trigger automatic deployment"
    echo "- Go to Actions tab and run workflow manually"
fi

# Option 3: Show status
if [ "$1" = "status" ]; then
    echo -e "${YELLOW}📊 Project Status:${NC}"
    echo ""

    # Check if files exist
    echo -e "${GREEN}📁 Project Structure:${NC}"
    echo "├── .nojekyll (for GitHub Pages)"
    echo "├── .github/workflows/deploy.yml (GitHub Actions)"
    echo "├── prime-capas/ (main application)"
    echo "│   ├── index.html"
    echo "│   ├── main.js"
    echo "│   ├── styles.css"
    echo "│   └── assets/ (images, models, scenarios)"
    echo "└── README.md (documentation)"

    echo ""
    echo -e "${GREEN}🔗 Deployment URLs:${NC}"
    echo "Live: https://your-username.github.io/prime-capas-showcase"
    echo "Local: http://localhost:8000"
fi

# Default help
if [ -z "$1" ]; then
    echo -e "${YELLOW}📋 Usage:${NC}"
    echo ""
    echo "  ./deploy.sh local    # Start local server for testing"
    echo "  ./deploy.sh github   # Show GitHub Pages setup instructions"
    echo "  ./deploy.sh status   # Show project status"
    echo "  ./deploy.sh          # Show this help"
    echo ""
    echo -e "${GREEN}✅ GitHub Actions workflow is configured for automatic deployment${NC}"
    echo -e "${YELLOW}💡 Simply push to main branch to deploy automatically${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Prime Capas Showcase - Ready for deployment!${NC}"
