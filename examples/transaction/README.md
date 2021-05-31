# TinyPg Example Project

To get started run the following commands from the base directory of this example.

1. Start postgres in a docker container. This also mounts a local directory that contains the DDL to configure the database.
    ```bash
    docker-compose up -d
    ```
1. Migrate the example schema
    ```bash
    docker-compose exec postgres psql -U postgres -f /migrations/setup.sql
    ```
1. Install packages
    ```bash
    npm install
    ```
1. Run the application
    ```bash
    npm start
    ```
