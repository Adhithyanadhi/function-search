FROM node:18

# Arguments for user setup
ARG USERNAME=devuser
ARG UID=1002
ARG GID=2003

# Install essential dependencies (no need for x11 or xvfb)
RUN apt-get update && apt-get install -y --no-install-recommends \ 
    && rm -rf /var/lib/apt/lists/*

# Set working directory and install VS Code extension generator globally
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install -g yo generator-code

# Add user for non-root operations
RUN groupadd -g ${GID} ${USERNAME} && \
    useradd -m -u ${UID} -g ${GID} -s /bin/bash ${USERNAME}

# Set proper permissions
RUN chown -R ${USERNAME}:${USERNAME} /app

# Switch to non-root user
USER ${USERNAME}

# Install dependencies in container (node_modules)
RUN npm install
