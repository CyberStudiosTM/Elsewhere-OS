@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo Could not open the Messenger code folder.
  pause
  exit /b 1
)
if not exist "supabase\functions\elsewhere-account-delete\index.ts" (
  echo The account deletion function is missing from supabase\functions.
  popd
  pause
  exit /b 1
)
call npx --yes --package=supabase@3.2.0 -- supabase functions deploy elsewhere-account-delete --remote=mnyreqbdzgvrqlrhvxel --use-api --no-verify-jwt --yes
set "elsewhere_exit=%errorlevel%"
popd
echo.
if "%elsewhere_exit%"=="0" (
  echo Account deletion function deployed.
) else (
  echo Deployment failed. Review the Supabase error above.
)
pause
exit /b %elsewhere_exit%
