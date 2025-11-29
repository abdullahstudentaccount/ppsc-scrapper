# Use Node.js 18 LTS
FROM node:18

# Install Linux dependencies needed by Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libxkbcommon0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxshmfence1 \
    libdrm2 \
    gcc g++ make \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json & package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install Chromium for Playwright
RUN npx playwright install chromium

# Copy project files
COPY . .

# Set environment variable for Railway port
ENV PORT=3000

# Start the server
CMD ["node", "server.js"]
