const express = require('express');
const db = require('../db')

const router = express.Router();

// check if user1 can send a friend request to user2 (i.e. 5 minute cooldown has passed)
const checkCooldown = async (senderId, receiverId) => {
    try {
        const result = await db.query(
            `SELECT time_modified FROM RequestFriendship
             WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
             ORDER BY time_modified DESC
             LIMIT 1`,
            [senderId, receiverId]
        );

        if (result.rows.length === 0) {
            return { allowed: true };
        }

        const lastModified = new Date(result.rows[0].time_modified);
        const now = new Date();
        const diffMinutes = (now - lastModified) / (1000 * 60);

        if (diffMinutes < 5) {
            return { 
                allowed: false, 
                error: `You must wait 5 minutes before sending another friend request.` 
            };
        }

        return { allowed: true };
    } catch (err) {
        return { allowed: false, error: "Internal server error during cooldown check: " + err.message  };
    }
};

// remove user2 from user1's shared stock lists and vice versa
async function removeMutualAccess(user1, user2) {
    if (!user1 || !user2) return false;

    try {
        const result = await db.query(
            `DELETE FROM AccountCanSeeStockList
             WHERE 
                (viewer_id = $1 AND stock_list_id IN (
                    SELECT stock_list_id FROM StockList WHERE owner_id = $2
                ))
                OR
                (viewer_id = $2 AND stock_list_id IN (
                    SELECT stock_list_id FROM StockList WHERE owner_id = $1
                ))`,
            [user1, user2]
        );

        return true;
    } catch (err) {
        return err;
    }
}

// check if friend request/friendship exists between two users (one-sided)
const friendRequestExists = async (userId1, userId2) => {
    const data = await db.query(
        `SELECT * FROM RequestFriendship
            WHERE sender_id = $1 AND receiver_id = $2 
            AND status != 'rejected'`,
        [userId1, userId2]
    );
    return data.rows.length > 0;
};

// get all friends or friend requests for a user by status (for accepted and rejected only, NOT PENDING)
router.get('/:status', async (req, res) => {
    const userId = req.session.accountId;
    const status = req.params.status;

    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status parameter' });
    }

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid userId parameter' });
    }

    try {
        const data = await db.query(`
            SELECT 
                CASE 
                    WHEN sender_id = $1 THEN receiver_id 
                    ELSE sender_id 
                END AS friend_id,
                a.username AS friend_username,
                r.status
            FROM RequestFriendship r
            JOIN Account a 
                ON a.account_id = CASE 
                                    WHEN r.sender_id = $1 THEN r.receiver_id 
                                    ELSE r.sender_id 
                                END
            WHERE (r.sender_id = $1 OR r.receiver_id = $1)
                AND r.status = $2
        `, [userId, status]);

        return res.status(200).json(data.rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// get all incoming friend requests for a user
router.get('/requests/incoming', async (req, res) => {
    const userId = req.session.accountId;
    if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid userId parameter' });
    }
    try {
        const data = await db.query(`
            SELECT r.sender_id AS friend_id, a.username AS friend_username, r.status
            FROM RequestFriendship r
            JOIN Account a ON r.sender_id = a.account_id
            WHERE r.receiver_id = $1 AND r.status = 'pending'
        `, [userId]);
        return res.status(200).json(data.rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// get all outgoing friend requests for a user
router.get('/requests/outgoing', async (req, res) => {
    const userId = req.session.accountId;
    if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid userId parameter' });
    }
    try {
        const data = await db.query(`
            SELECT r.receiver_id AS friend_id, a.username AS friend_username, r.status
            FROM RequestFriendship r
            JOIN Account a ON r.receiver_id = a.account_id
            WHERE r.sender_id = $1 AND r.status = 'pending'
        `, [userId]);
        return res.status(200).json(data.rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// accept/reject a friend request
router.put('/requests/interact', async (req, res) => {
    const receiverId = req.session.accountId;
    const { senderId, newStatus } = req.body;

    if (!receiverId || isNaN(receiverId) || !senderId || isNaN(senderId)) {
        return res.status(400).json({ error: 'Invalid senderId or receiverId' });
    }

    if (senderId === receiverId) {
        return res.status(400).json({ error: 'Cannot accept friend request from oneself' });
    }

    try {

        if (!(await friendRequestExists(senderId, receiverId))) {
            return res.status(404).json({ error: 'Friend request does not exist' });
        }

        const data = await db.query(
            `UPDATE RequestFriendship 
             SET status = $3, time_modified = CURRENT_TIMESTAMP
             WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'`,
            [senderId, receiverId, newStatus]
        );

        if (data.rowCount === 0) {
            return res.status(404).json({ error: 'Friend request not found or already processed' });
        }

        return res.status(200).json({ message: 'Friend request accepted/rejected successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// send a friend request
router.post('/requests/send', async (req, res) => {
    const senderId = req.session.accountId;
    const { receiverId } = req.body;

    if (!senderId || isNaN(senderId) || !receiverId || isNaN(receiverId)) {
        return res.status(400).json({ error: 'Invalid senderId or receiverId' });
    }
    if (senderId === receiverId) {
        return res.status(400).json({ error: 'Cannot send friend request to oneself' });
    }

    try {

        if (await friendRequestExists(senderId, receiverId) ||
            await friendRequestExists(receiverId, senderId)) {
            return res.status(409).json({ error: 'Friend request or friendship already exists' });
        }

        const response = await checkCooldown(senderId, receiverId);

        if (!response.allowed) {
            return res.status(429).json({ error: response.error });
        }

        const data = await db.query(
            `INSERT INTO RequestFriendship (sender_id, receiver_id, status) 
             VALUES ($1, $2, 'pending') 
             ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = EXCLUDED.status, time_modified = CURRENT_TIMESTAMP`,
            [senderId, receiverId]
        );

        if (data.rowCount === 0) {
            return res.status(409).json({ error: 'Friend request already exists' });
        }

        // delete any previous rejected request sent by receiver to sender
        await db.query(
            `DELETE FROM RequestFriendship 
             WHERE sender_id = $1 AND receiver_id = $2 AND status = 'rejected'`,
            [receiverId, senderId]
        );

        return res.status(200).json({ message: 'Friend request sent successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// delete a friend
router.delete('/:friendId', async (req, res) => {
    const userId = req.session.accountId;
    const friendId = req.params.friendId;

    if (!userId || isNaN(userId) || !friendId || isNaN(friendId)) {
        return res.status(400).json({ error: 'Invalid userId or friendId' });
    }

    try {

        if (!(await friendRequestExists(userId, friendId)) &&
            !(await friendRequestExists(friendId, userId))) {
            return res.status(404).json({ error: 'Friendship does not exist' });
        }

        const data = await db.query(
            `UPDATE RequestFriendship 
            SET status = 'rejected', time_modified = CURRENT_TIMESTAMP
             WHERE ((sender_id = $1 AND receiver_id = $2) 
                OR (sender_id = $2 AND receiver_id = $1))
                AND status = 'accepted'`,
            [userId, friendId]
        );

        if (data.rowCount === 0) {
            return res.status(404).json({ error: 'Friendship not found' });
        }

        const response = await removeMutualAccess(userId, friendId);

        if (response instanceof Error) {
            return res.status(500).json({ error: response.message});
        }

        if (!response) {
            return res.status(500).json({ error: 'Failed to remove mutual access' });
        }

        return res.status(200).json({ message: 'Friend deleted successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;