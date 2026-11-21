@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo Could not open the Messenger code folder.
  pause
  exit /b 1
)
if not exist "supabase\functions\elsewhere-instagram-webhook\index.ts" (
  echo The Instagram webhook function is missing from supabase\functions.
  popd
  pause
  exit /b 1
)
call npx --yes --package=supabase@3.2.0 -- supabase functions deploy elsewhere-instagram-webhook --remote=mnyreqbdzgvrqlrhvxel --use-api --no-verify-jwt --yes
set "elsewhere_exit=%errorlevel%"
popd
echo.
if "%elsewhere_exit%"=="0" (
  echo Instagram instant-updates webhook deployed.
) else (
  echo Deployment failed. Review the Supabase error above.
)
pause
exit /b %elsewhere_exit%
