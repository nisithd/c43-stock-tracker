const express = require('express');
const db = require('../db')

const router = express.Router();

// get number of shares for a stock holding in a portfolio
router.get('/:portfolioId/:symbol', async (req, res) => {
    const portfolioId = req.params.portfolioId;
    const symbol = req.params.symbol;

    try {
        const data = await db.query('SELECT * FROM StockHolding WHERE portfolio_id = $1 AND symbol = $2', [portfolioId, symbol]);

        if (data.rows.length === 0) {
            return res.status(404).json({ error: 'Stock holding not found' });
        }

        return res.status(200).json(data.rows[0].shares);
    }
    catch (err) {
        return res.status(500).json({ error: err });
    }
});

// add or update a stock holding in a portfolio
router.post('/', async (req, res) => {
    const { portfolioId, symbol, shares } = req.body;

    try {
        const ret = await db.query( // overwrites shares if entry exists
            'INSERT INTO StockHolding (portfolio_id, symbol, shares) VALUES ($1, $2, $3) ON CONFLICT (portfolio_id, symbol) DO UPDATE SET shares = EXCLUDED.shares', 
            [portfolioId, symbol, shares]
        );

        if (ret.rowCount === 0) {
            return res.status(500).json({ error: 'Failed to add/update stock holding' });
        }

        return res.status(200).json({ message: 'Stock holding added/updated successfully' });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ error: err });
    }
});

module.exports = router;