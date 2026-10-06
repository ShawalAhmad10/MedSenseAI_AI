ALTER TABLE stock ADD COLUMN IF NOT EXISTS stock_number varchar(255);
ALTER TABLE stock_history_open ADD COLUMN IF NOT EXISTS opening_number varchar(255);
ALTER TABLE stock_history_open ADD COLUMN IF NOT EXISTS source_batch_id integer REFERENCES stock_history(batch_id);
ALTER TABLE stock_return ADD COLUMN IF NOT EXISTS return_number varchar(255);
WITH numbered AS (SELECT stock_id, row_number() OVER(ORDER BY creation_day,created_at,stock_id) AS n FROM stock)
UPDATE stock s SET stock_number='STK-'||lpad(n.n::text,GREATEST(3,length(n.n::text)),'0') FROM numbered n
WHERE s.stock_id=n.stock_id AND s.stock_number IS NULL;
WITH numbered AS (SELECT open_id,row_number() OVER(ORDER BY creation_day,created_at,open_id) AS n FROM stock_history_open)
UPDATE stock_history_open s SET opening_number='OPEN-'||lpad(n.n::text,GREATEST(3,length(n.n::text)),'0') FROM numbered n
WHERE s.open_id=n.open_id AND s.opening_number IS NULL;
WITH numbered AS (SELECT return_id,row_number() OVER(ORDER BY creation_day,created_at,return_id) AS n FROM stock_return)
UPDATE stock_return s SET return_number='SRET-'||lpad(n.n::text,GREATEST(3,length(n.n::text)),'0') FROM numbered n
WHERE s.return_id=n.return_id AND s.return_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_public_number_unique ON stock(stock_number);
CREATE UNIQUE INDEX IF NOT EXISTS opening_public_number_unique ON stock_history_open(opening_number);
CREATE UNIQUE INDEX IF NOT EXISTS return_public_number_unique ON stock_return(return_number);
CREATE UNIQUE INDEX IF NOT EXISTS opening_source_batch_unique ON stock_history_open(source_batch_id) WHERE source_batch_id IS NOT NULL;
