### Overview

This slack integration uses NodeJS, a Postgres database, and is deployed to Heroku.

### Getting started

Follow this guide for doing Node development on Heroku: https://devcenter.heroku.com/articles/getting-started-with-nodejs
Most important points:

1. Get nodejs (https://nodejs.org/en/download/)
1. Download heroku toolbelt
1. `heroku login`
1. Get Postgres.app (http://postgresapp.com/), follow setup instructions (http://postgresapp.com/documentation/cli-tools.html), and start it up.
1. `export DATABASE_URL=postgres:///mitdb`
1. Pull down production database: `heroku pg:pull HEROKU_POSTGRESQL_BRONZE_URL mitdb --app mit-ult-slack`
1. `npm install`
1. heroku local web
1. Test it: `http://localhost:5000/practice?id=20`

Here's some general information on accessing the heroku DB from the command line: https://devcenter.heroku.com/articles/heroku-postgresql#using-the-cli

If you make changes and want to push them to production, commit them to the master branch and then run `git push heroku master`
