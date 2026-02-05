# Use Python 3.11 slim image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create data directory for persistent storage
RUN mkdir -p /app/data && chmod 755 /app/data

# Copy the entire application
COPY . .

# Ensure data directory has correct permissions after copy
RUN chmod 755 /app/data

# Expose port 8080
EXPOSE 8080

# Run the Sanic server
CMD ["python3", "server.py"]
