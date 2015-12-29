CREATE TYPE practice_status AS ENUM ('in', 'out');

CREATE TABLE "replies"
(
    practiceid integer NOT NULL,
    username text,
    message text,
    status practice_status NOT NULL
)
