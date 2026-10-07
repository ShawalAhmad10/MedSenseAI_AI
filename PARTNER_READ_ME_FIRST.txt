MEDSENSEAI - PRIVATE PARTNER PACKAGE
====================================

DATABASE
--------
This copy uses the existing shared Neon PostgreSQL database.

DO NOT:
- create another project database
- restore old PostgreSQL backups
- run seed/demo scripts
- change the supplied database configuration
- upload this ZIP publicly


FIRST TIME
----------
Install these first if they are not already installed:

- Node.js
- Python 3.12
- Python 3.13
- Windows Python Launcher

Then double-click:

RUN_FIRST_TIME.cmd

Internet access is required during first setup to install dependencies.


AFTER FIRST SETUP
-----------------
Double-click:

RUN_MEDSENSEAI.cmd


SERVICES
--------
Frontend : 5173
Backend  : 5005
Main AI  : 8000
Lead AI  : 8002


DATABASE
--------
All systems using the supplied configuration connect to the same
shared Neon project database.