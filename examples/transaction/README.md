# TinyPg Example Project

To get started run the following commands from the base directory of this git repository. You may need to tweak the postgres connection string and/or psql arguments.

```
# Start postgres in a docker container
docker-compose up -d

# Create the example tables
PGPASSWORD=tinypg psql -U postgres -h 127.0.0.1 -p 54999 -f setup.sql

# Configure our test application
npm install

# Start the test application
npm start
```
