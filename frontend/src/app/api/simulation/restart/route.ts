import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' | 'stop'
    const flowType = body.flowType || 'light-medium'; // 'light-medium' | 'medium-high'

    console.log(`[API] Simulation request received - action: ${action}, flowType: ${flowType}`);

    const projectRootDir = path.resolve(process.cwd(), '..');
    const composeFile = path.join(projectRootDir, 'infra', 'docker-compose.yml');

    if (action === 'stop') {
      console.log('[API] Killing traffic generator container immediately...');
      const cmd = `docker compose -f "${composeFile}" --profile generate kill traffic_generator`;
      console.log(`[API] Executing command: ${cmd}`);
      try {
        const { stdout, stderr } = await execPromise(cmd);
        console.log('[API] docker compose kill stdout:', stdout);
        if (stderr) console.warn('[API] docker compose kill stderr:', stderr);
      } catch (err: any) {
        console.warn('[API] docker compose kill failed (it might already be stopped/killed):', err.message);
      }

      // Also reset metrics on coordinator so charts clear to 0
      try {
        await fetch('http://localhost:8000/api/v1/reset', { method: 'POST' });
      } catch (err) {
        console.warn('[API] Failed to reset backend metrics:', err);
      }

      return NextResponse.json({
        status: 'success',
        message: 'Simulation stopped successfully',
      });
    }

    // --- Action: START/RESTART ---

    // 1. Reset metrics on coordinator
    try {
      const resetRes = await fetch('http://localhost:8000/api/v1/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (resetRes.ok) {
        console.log('[API] Backend metrics reset successfully');
      }
    } catch (err) {
      console.warn('[API] Failed to reset backend metrics:', err);
    }

    // 2. Prepare the correct scenario configuration in active.yaml
    const scenariosDir = path.join(projectRootDir, 'scenarios');
    const templateName = flowType === 'medium-high' ? 'medium_high.yaml' : 'light_medium.yaml';
    const templatePath = path.join(scenariosDir, templateName);
    const activePath = path.join(scenariosDir, 'active.yaml');

    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, activePath);
      console.log(`[API] Copied ${templateName} to active.yaml`);
    } else {
      // Fallback inline template in case file copies are missing
      const classDist = flowType === 'medium-high'
        ? 'light: 0.00\n    medium: 0.60\n    heavy: 0.40'
        : 'light: 0.40\n    medium: 0.60\n    heavy: 0.00';
      
      const fallbackYaml = `# Auto-generated active scenario
scenario:
  name: "active"
  description: "Dynamic Flow: ${flowType}"
  version: "1.0"

traffic:
  rps: 120
  duration_seconds: 3600
  ramp_up_seconds: 2
  class_distribution:
    ${classDist}
  pattern:
    type: "constant"
    jitter_pct: 5
  endpoints:
    - path: "/api/search"
      method: "GET"
      weight: 0.3
  source_ids:
    count: 50
    prefix: "user_"
`;
      fs.writeFileSync(activePath, fallbackYaml);
      console.log(`[API] Wrote fallback config for ${flowType} to active.yaml`);
    }

    // 3. Start the traffic generator container immediately.
    // The scenario YAML updates instantly because of the volume mount.
    const cmd = `docker compose -f "${composeFile}" --profile generate up -d --force-recreate traffic_generator`;
    console.log(`[API] Executing command: ${cmd}`);

    const { stdout, stderr } = await execPromise(cmd);
    console.log('[API] docker compose stdout:', stdout);
    if (stderr) {
      console.warn('[API] docker compose stderr:', stderr);
    }

    return NextResponse.json({
      status: 'success',
      message: `Simulation started successfully with ${flowType} flow`,
    });
  } catch (error: any) {
    console.error('[API] Error restarting simulation:', error);
    return NextResponse.json(
      { status: 'error', error: error.message || String(error) },
      { status: 500 }
    );
  }
}
