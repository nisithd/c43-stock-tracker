require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Pool } = require('pg');

const userRouter = require('./routes/user');
const stockRouter = require('./routes/stocks');
const stockHoldingRouter = require('./routes/stockHolding');
const friendsRouter = require('./routes/friends');

const PORT = 3000;


const app = express();

app.use(express.json());

app.use('/user', userRouter);
app.use('/stocks', stockRouter);
app.use('/stockHoldings', stockHoldingRouter);
app.use('/friends', friendsRouter);

const server = http.createServer(app).listen(PORT, function(err) {
  if (err) console.log(err);
  else console.log("HTTP server on http://localhost:%s", PORT);
});

module.exports = app;