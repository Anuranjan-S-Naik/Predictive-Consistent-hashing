# PAF Frontend - Full Clean Reinstall Script
# Run from: frontend/ directory

Write-Host "Step 1: Kill node processes" -ForegroundColor Cyan
taskkill /F /IM node.exe 2>$null

Write-Host "Step 2: Delete broken deps" -ForegroundColor Cyan
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json }
if (Test-Path pnpm-lock.yaml) { Remove-Item -Force pnpm-lock.yaml }
if (Test-Path yarn.lock) { Remove-Item -Force yarn.lock }

Write-Host "Step 3: Clear npm cache" -ForegroundColor Cyan
npm cache clean --force

Write-Host "Step 4: Backup tailwind config" -ForegroundColor Cyan
if (Test-Path tailwind.config.ts) { Copy-Item tailwind.config.ts tailwind.config.ts.bak }
if (Test-Path postcss.config.js) { Copy-Item postcss.config.js postcss.config.js.bak }

Write-Host "Step 5: Install Next.js 14 core" -ForegroundColor Cyan
npm install next@14 react@latest react-dom@latest

Write-Host "Step 6: Install TypeScript" -ForegroundColor Cyan
npm install -D typescript @types/react @types/node @types/react-dom

Write-Host "Step 7: Install Tailwind and UI libs" -ForegroundColor Cyan
npm install -D tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge lucide-react

Write-Host "Step 8: Install Radix and Sonner" -ForegroundColor Cyan
npm install @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-slider @radix-ui/react-progress @radix-ui/react-separator @radix-ui/react-scroll-area sonner date-fns

Write-Host "Step 9: Install state and API" -ForegroundColor Cyan
npm install zustand axios @tanstack/react-query

Write-Host "Step 10: Install forms" -ForegroundColor Cyan
npm install react-hook-form zod @hookform/resolvers

Write-Host "Step 11: Install WebSocket" -ForegroundColor Cyan
npm install socket.io-client

Write-Host "Step 12: Install charting" -ForegroundColor Cyan
npm install echarts echarts-for-react framer-motion

Write-Host "Step 13: Install ESLint for Next 14" -ForegroundColor Cyan
npm install -D eslint eslint-config-next@14

Write-Host "Step 14: Restore tailwind config" -ForegroundColor Cyan
if (Test-Path tailwind.config.ts.bak) {
    Copy-Item tailwind.config.ts.bak tailwind.config.ts -Force
    Remove-Item tailwind.config.ts.bak
}
if (Test-Path postcss.config.js.bak) {
    Copy-Item postcss.config.js.bak postcss.config.js -Force
    Remove-Item postcss.config.js.bak
}

Write-Host "Step 15: Verify Next version" -ForegroundColor Cyan
npm list next

Write-Host "DONE - Now run: npm run build" -ForegroundColor Green
