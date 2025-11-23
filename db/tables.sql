CREATE DATABASE stocktracker;

\c stocktracker

CREATE TABLE account (
    account_id SERIAL PRIMARY KEY,
    username VARCHAR (20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL -- long enough to store hashed passwords
);

CREATE TABLE stock (
    current_price INT CHECK (current_price >= 0) NOT NULL,
    symbol VARCHAR(10) PRIMARY KEY
);

CREATE TABLE portfolio (
    portfolio_id SERIAL PRIMARY KEY,
    cash_account NUMERIC(10,2) NOT NULL,
    owner_id INT REFERENCES account(account_id)
);

CREATE TABLE stockList (
    stock_list_id SERIAL PRIMARY KEY,
    visibility VARCHAR(10) NOT NULL,
    owner_id INT REFERENCES account(account_id)
);

CREATE TABLE review (
    review_id SERIAL PRIMARY KEY,
    review TEXT,
    reviewer_id INT REFERENCES account(account_id),
    stock_list_id INT REFERENCES stockList(stock_list_id)
);

CREATE TABLE stockHolding (
    shares INT CHECK (shares >= 0),
    symbol VARCHAR(10) REFERENCES stock(symbol), 
    portfolio_id INT REFERENCES portfolio(portfolio_id),
    PRIMARY KEY (symbol, portfolio_id)
);

CREATE TABLE transaction (
    transaction_id SERIAL PRIMARY KEY, 
    type VARCHAR(25),
    symbol VARCHAR(10) REFERENCES stock(symbol),
    shares_moved INT CHECK (shares_moved >= 0) NOT NULL,
    strike_price NUMERIC(10,2) check (strike_price >= 0) NOT NULL,
    date_time TIMESTAMP NOT NULL,
    portfolio_id INT REFERENCES portfolio(portfolio_id)  -- ER digram imples this by making one to many relationship between Transaction and StockHolding
);

CREATE TABLE dailyRangeStock (
    symbol varchar(10) REFERENCES stock(symbol) NOT NULL, 
    s_timestamp TIMESTAMP NOT NULL, 
    open NUMERIC(10,2) NOT NULL,
    high NUMERIC(10,2) NOT NULL,
    close NUMERIC(10,2) NOT NULL,
    low NUMERIC(10,2) NOT NULL,
    volume INT CHECK (volume >= 0),
    PRIMARY KEY (symbol, s_timestamp)
);

CREATE TABLE requestFriendship (
    sender_id INT REFERENCES account(account_id),
    receiver_id INT REFERENCES account(account_id),
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),  -- set this to CURRENT_TIMESTAMP (on the backend) on creation or any modification to an entry of this table
    PRIMARY KEY (sender_id, receiver_id)
);

-- stocklists that are shared with an account
CREATE TABLE accountCanSeeStockList (
    viewer_id INT REFERENCES account(account_id),
    stock_list_id INT REFERENCES stockList(stock_list_id),
    PRIMARY KEY (viewer_id, stock_list_id)
);

CREATE TABLE stockListContainStockHolding (
    stock_list_id INT NOT NULL REFERENCES stockList(stock_list_id),
    symbol VARCHAR(10) NOT NULL,
    portfolio_id INT NOT NULL,
    FOREIGN KEY (symbol, portfolio_id) REFERENCES StockHolding(symbol, portfolio_id),
    PRIMARY KEY (stock_list_id, symbol, portfolio_id)
)