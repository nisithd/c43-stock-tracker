const express = require('express');
const session = require('express-session');
const db = require('../db')

const router = express.Router();

router.post('/signup', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(422).send('Missing username or password');
    }

    try {
        const ret = await db.query('INSERT INTO Account (username, password) VALUES ($1, $2)', [username, password]);
        
        return res.status(200).json({ message: 'Registration successful' });
    }
    catch (err) {
        return res.status(500).json({ error: err });
    }
});

router.put('/signin', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    try {
        const ret = await db.query('SELECT * FROM Account WHERE username = $1', [username]);

        if (ret.rows.length == 0) return res.status(400).json({ error: 'User not found' });

        if (ret.rows[0].password != password) return res.status(400).json({ error: 'Incorrect password' });

        req.session.user = username;
        req.session.accountId = ret.rows[0].account_id

        return res.status(200).json({ message: 'Signin successful' });
    }
    catch (err) {
        return res.status(500).json({ error: err });
    }
});

router.get('/signout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'logout error' });
        }
        return res.json({ message: 'Signout successful' });
    });
});

router.get('/current', (req, res) => {
    return res.json({ user: req.session.user, accountId: req.session.accountId });
});

module.exports = router;