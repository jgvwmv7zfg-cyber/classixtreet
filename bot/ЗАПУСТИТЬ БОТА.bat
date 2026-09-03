@echo off
rem ============================================================
rem  CLASSIXTREET - zapusk bota
rem ------------------------------------------------------------
rem  Dvoynoy klik po etomu faylu zapuskaet bota v svoyom okne.
rem  Okno nado ostavit otkrytym - poka ono est, bot rabotaet.
rem  Zakryt okno ili nazhat Ctrl+C - bot ostanovitsya.
rem
rem  Esli bot upadyot iz-za oshibki, on podnimetsya sam
rem  cherez 10 sekund.
rem ============================================================

rem Cyrillica v okne
chcp 65001 >nul

rem Perehodim v papku sayta (na uroven vyshe etogo fayla)
cd /d "%~dp0.."

title CLASSIXTREET - bot

:start
echo.
echo ============================================================
echo  Zapusk bota...  Ostanovit - Ctrl+C
echo ============================================================
echo.

py bot\bot.py

rem Syuda popadaem, esli bot zavershilsya
echo.
echo ------------------------------------------------------------
echo  Bot ostanovilsya. Perezapusk cherez 10 sekund.
echo  Chtoby vyyti - zakroyte okno ili nazhmite Ctrl+C.
echo ------------------------------------------------------------
timeout /t 10 >nul
goto start
