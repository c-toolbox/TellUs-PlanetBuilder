Write-Host "Starting Python proxy..."
Start-Process powershell -ArgumentLis "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; python .\proxy\proxy.py"

Write-Host "Starting frontend dev server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
