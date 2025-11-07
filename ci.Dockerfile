# ci.Dockerfile — Local CI replica image (not used by Actions)
FROM node:22-bookworm

# Basic OS deps for native modules like better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -ms /bin/bash appuser
USER appuser
WORKDIR /work

# Default command does nothing; we'll pass a script at runtime
CMD ["bash"]
