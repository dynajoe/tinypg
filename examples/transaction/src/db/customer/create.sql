INSERT INTO tinypg.customer (
   first_name,
   last_name
)
VALUES (
   :first_name,
   :last_name
)
RETURNING *;