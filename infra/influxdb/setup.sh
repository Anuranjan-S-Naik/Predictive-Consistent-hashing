#!/bin/bash
# ============================================================================
# InfluxDB Post-Init Setup
# Creates the 'forecast' bucket (the 'metrics' bucket is created by DOCKER_INFLUXDB_INIT_BUCKET)
# ============================================================================

set -e

echo "Creating 'forecast' bucket with 7-day retention..."
influx bucket create \
  --name forecast \
  --org paf \
  --retention 168h \
  --token "${DOCKER_INFLUXDB_INIT_ADMIN_TOKEN}" \
  2>/dev/null || echo "Bucket 'forecast' may already exist, skipping."

echo "InfluxDB setup complete. Buckets: metrics (30d), forecast (7d)"