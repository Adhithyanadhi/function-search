FROM node:22

# Arguments for user setup
ARG USERNAME=devuser
ARG UID=1002
ARG GID=2003

# Install essential dependencies (no need for x11 or xvfb)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxfixes3 \
    libglib2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libcurl4 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory and install VS Code extension generator globally
WORKDIR /app
RUN npm install -g yo generator-code

# Add user for non-root operations
RUN groupadd -g ${GID} ${USERNAME} && \
    useradd -m -u ${UID} -g ${GID} -s /bin/bash ${USERNAME}

# Set proper permissions
RUN chown -R ${USERNAME}:${USERNAME} /app

# Switch to non-root user
USER ${USERNAME}


# Set environment variables to run Electron headlessly
ENV ELECTRON_RUN_AS_NODE=true
ENV DISPLAY=:99 

# Default command for benchmark (no xvfb-run needed anymore)
CMD ["npm", "run", "benchmark"]
