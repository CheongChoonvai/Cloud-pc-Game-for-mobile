# Cloud Game Server - Easy Launcher (PowerShell)
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Cloud Game Server - Easy Launcher" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Function to kill process on a specific port
function Kill-ProcessOnPort {
    param([int]$Port)
    
    $connections = netstat -ano | Select-String ":$Port\s+.*LISTENING"
    foreach ($conn in $connections) {
        $parts = $conn -split '\s+'
        $pid = $parts[-1]
        if ($pid -match '^\d+$') {
            Write-Host "Killing process on port $Port (PID: $pid)" -ForegroundColor Yellow
            try {
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Host "  Successfully killed PID $pid" -ForegroundColor Green
            } catch {
                Write-Host "  Failed to kill PID $pid - trying taskkill..." -ForegroundColor Red
                & taskkill /PID $pid /F /T 2>$null
            }
        }
    }
}

Write-Host "Cleaning up old server processes..." -ForegroundColor Yellow

# Kill processes on our ports
Kill-ProcessOnPort -Port 8889
Kill-ProcessOnPort -Port 8765

# Wait for ports to be released
Write-Host ""
Write-Host "Waiting for ports to be released..." -ForegroundColor Yellow
$maxWait = 15
$waited = 0

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    
    $port8889 = netstat -ano | Select-String ":8889\s+.*LISTENING"
    $port8765 = netstat -ano | Select-String ":8765\s+.*LISTENING"
    
    if (-not $port8889 -and -not $port8765) {
        Write-Host "Ports are free!" -ForegroundColor Green
        break
    }
    
    Write-Host "  Still waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
}

if ($waited -ge $maxWait) {
    Write-Host ""
    Write-Host "WARNING: Ports may still be in use. Trying to start anyway..." -ForegroundColor Red
}

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Start the server
python server_gui.py

# Keep window open on exit
Write-Host ""
Read-Host "Press Enter to exit"
