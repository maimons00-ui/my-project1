@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ==================================
echo Local Computer Information
echo ==================================
echo Computer Name: %COMPUTERNAME%
echo User Name: %USERNAME%
echo.

echo IPv4 Addresses:
set "foundIP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /I /C:"IPv4"') do (
    set "ip=%%A"
    set "ip=!ip: =!"
    if not "!ip!"=="" (
        set "foundIP=1"
        echo  - !ip!
    )
)

if not defined foundIP (
    echo  (No IPv4 address found)
)

echo.
echo Done.
endlocal
